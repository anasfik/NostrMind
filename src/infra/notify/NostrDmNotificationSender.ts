import { SimplePool, finalizeEvent, nip17, nip19 } from "nostr-tools";
import WebSocket from "ws";
import type { NotificationSender } from "../../contracts";
import type { AppIdentityRepository } from "../repositories";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket as any;
}

function formatNotificationMessage(
  input: Parameters<NotificationSender["sendMatchNotification"]>[0],
): string {
  const parts = [
    `Nostr-Claw match for \"${input.watchlist.name}\"`,
    "",
    input.aiDecision.message ?? "A matching event was found.",
    "",
    `Event: https://njump.me/${input.event.id}`,
    `Author: https://njump.me/${input.event.pubkey}`,
    input.aiDecision.actionable_link
      ? `Actionable link: ${input.aiDecision.actionable_link}`
      : undefined,
    input.aiDecision.match_score !== undefined
      ? `Match score: ${input.aiDecision.match_score}`
      : undefined,
    input.aiDecision.recommended_actions?.length
      ? `Recommended actions: ${input.aiDecision.recommended_actions.join(" | ")}`
      : undefined,
    "",
    `Prompt: ${input.watchlist.prompt}`,
    `Content: ${input.event.content}`,
  ];

  return parts.filter(Boolean).join("\n");
}

type LoggerLike = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const RELAY_EVENT_TAGS = new Set(["relay", "r"]);

function normalizeRelayUrl(value: string | undefined): string | undefined {
  const relay = value?.trim();
  if (!relay) {
    return undefined;
  }

  return relay.startsWith("wss://") || relay.startsWith("ws://")
    ? relay
    : undefined;
}

export class NostrDmNotificationSender implements NotificationSender {
  private readonly pool = new SimplePool();
  private readonly recipientPubkey: string;
  private senderSecretKey?: Uint8Array;
  private senderPubkey?: string;

  constructor(
    private readonly deps: {
      relays: string[];
      recipientNpub: string;
      identityRepo: AppIdentityRepository;
      logger: LoggerLike;
    },
  ) {
    const decodedNpub = nip19.decode(deps.recipientNpub);
    if (decodedNpub.type !== "npub") {
      throw new Error("NOTIFY_RECIPIENT_NPUB must be a valid npub");
    }

    this.recipientPubkey = decodedNpub.data;
  }

  private async getRecipientDmRelays(): Promise<string[]> {
    try {
      const relayListEvent = await this.pool.get(
        this.deps.relays,
        {
          authors: [this.recipientPubkey],
          kinds: [10050],
          limit: 1,
        },
        { maxWait: 2000 },
      );

      if (!relayListEvent) {
        return [];
      }

      const relays = relayListEvent.tags
        .filter((tag) => RELAY_EVENT_TAGS.has(tag[0]))
        .map((tag) => normalizeRelayUrl(tag[1]))
        .filter((relay): relay is string => Boolean(relay));

      return [...new Set(relays)];
    } catch (error) {
      this.deps.logger.error(
        { error, recipient: this.recipientPubkey },
        "failed to fetch recipient DM relay list (kind 10050)",
      );
      return [];
    }
  }

  private async publishToRelays(
    relays: string[],
    event: Parameters<SimplePool["publish"]>[1],
  ): Promise<{
    successfulRelays: string[];
    failedRelayCount: number;
    failedRelays: Array<{ relay: string; reason: string }>;
  }> {
    const uniqueRelays = [
      ...new Set(relays.map((relay) => relay.trim()).filter(Boolean)),
    ];
    const publishResults = await Promise.allSettled(
      this.pool.publish(uniqueRelays, event),
    );

    const successfulRelays: string[] = [];
    const failedRelays: Array<{ relay: string; reason: string }> = [];

    publishResults.forEach((result, index) => {
      if (
        result.status === "fulfilled" &&
        !(
          typeof result.value === "string" &&
          result.value.startsWith("connection failure:")
        )
      ) {
        successfulRelays.push(uniqueRelays[index]);
      } else {
        const reason =
          result.status === "fulfilled"
            ? result.value
            : result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);

        failedRelays.push({ relay: uniqueRelays[index], reason });
      }
    });

    return {
      successfulRelays,
      failedRelayCount: failedRelays.length,
      failedRelays,
    };
  }

  async initialize(): Promise<void> {
    const identity = this.deps.identityRepo.getOrCreateNotifierIdentity();
    const decodedNsec = nip19.decode(identity.nsec);
    if (decodedNsec.type !== "nsec") {
      throw new Error("stored notifier nsec is invalid");
    }

    this.senderSecretKey = decodedNsec.data;
    this.senderPubkey = identity.pubkey;

    const existingProfile = await this.pool.get(
      this.deps.relays,
      {
        authors: [identity.pubkey],
        kinds: [0],
      },
      { maxWait: 2000 },
    );

    if (!existingProfile) {
      const metadataEvent = finalizeEvent(
        {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify({
            name: "NostrClaw",
            display_name: "NostrClaw",
            about: "Autonomous Nostr intelligence watchdog",
          }),
        },
        this.senderSecretKey,
      );

      const metadataPublish = await this.publishToRelays(
        this.deps.relays,
        metadataEvent,
      );

      if (metadataPublish.successfulRelays.length === 0) {
        throw new Error(
          `failed to publish metadata profile to any relay: ${metadataPublish.failedRelays
            .map(({ relay, reason }) => `${relay} (${reason})`)
            .join("; ")}`,
        );
      }

      this.deps.logger.info(
        {
          pubkey: identity.pubkey,
          successfulRelayCount: metadataPublish.successfulRelays.length,
          failedRelayCount: metadataPublish.failedRelayCount,
          failedRelays: metadataPublish.failedRelays,
        },
        "published NostrClaw metadata profile",
      );
    }
  }

  async sendMatchNotification(
    input: Parameters<NotificationSender["sendMatchNotification"]>[0],
  ): Promise<void> {
    if (!this.senderSecretKey || !this.senderPubkey) {
      await this.initialize();
    }

    const plaintext = formatNotificationMessage(input);

    // NIP-17: Create gift-wrapped DM from NostrClaw to recipient
    // (kind 14 rumor → NIP-44 sealed kind 13 → NIP-44 gift-wrapped kind 1059)
    const giftWrap = nip17.wrapEvent(
      this.senderSecretKey!,
      { publicKey: this.recipientPubkey },
      plaintext,
    );

    const recipientDmRelays = await this.getRecipientDmRelays();
    const targetRelays = [
      ...new Set([...this.deps.relays, ...recipientDmRelays]),
    ];

    // Publish to configured relays + recipient DM relays (kind 10050)
    const publishResult = await this.publishToRelays(targetRelays, giftWrap);

    if (publishResult.successfulRelays.length === 0) {
      throw new Error(
        `failed to send NIP-17 DM: no relay accepted the event (${publishResult.failedRelays
          .map(({ relay, reason }) => `${relay}: ${reason}`)
          .join("; ")})`,
      );
    }

    this.deps.logger.info(
      {
        eventId: input.event.id,
        watchlistId: input.watchlist.id,
        recipient: this.recipientPubkey,
        relayCount: targetRelays.length,
        successfulRelayCount: publishResult.successfulRelays.length,
        failedRelayCount: publishResult.failedRelayCount,
        successfulRelays: publishResult.successfulRelays,
        failedRelays: publishResult.failedRelays,
      },
      "sent NIP-17 gift-wrapped DM to recipient",
    );
  }
}
