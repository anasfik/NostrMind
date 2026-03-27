import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const publishMock = vi.fn();
const querySyncMock = vi.fn();
const finalizeEventMock = vi.fn((event) => ({
  id: `finalized-${event.kind}`,
  ...event,
}));
const wrapManyEventsMock = vi.fn();
const nip19DecodeMock = vi.fn((value: string) => {
  if (value === "recipient-npub") {
    return { type: "npub", data: "recipient-pubkey" };
  }

  if (value === "sender-nsec") {
    return { type: "nsec", data: new Uint8Array([1, 2, 3, 4]) };
  }

  throw new Error(`unexpected decode input: ${value}`);
});

vi.mock("nostr-tools", () => ({
  SimplePool: class {
    get = getMock;
    publish = publishMock;
    querySync = querySyncMock;
  },
  finalizeEvent: finalizeEventMock,
  nip17: {
    wrapManyEvents: wrapManyEventsMock,
  },
  nip19: {
    decode: nip19DecodeMock,
    neventEncode: vi.fn((input: { id: string }) => `nevent1-${input.id}`),
  },
}));

describe("NostrDmNotificationSender", () => {
  beforeEach(() => {
    getMock.mockReset();
    publishMock.mockReset();
    querySyncMock.mockReset();
    finalizeEventMock.mockClear();
    wrapManyEventsMock.mockReset();
    nip19DecodeMock.mockClear();
  });

  it("publishes recipient and sender DM copies on the expected relays", async () => {
    getMock.mockResolvedValue({ id: "existing-profile", kind: 0, tags: [] });
    querySyncMock.mockResolvedValue([
      {
        id: "relay-list",
        created_at: 1700000000,
        tags: [
          ["relay", "wss://dm.one"],
          ["relay", "wss://relay.primal.net/"],
        ],
      },
    ]);
    wrapManyEventsMock.mockReturnValue([
      { id: "sender-copy", kind: 1059, tags: [["p", "sender-pubkey"]] },
      { id: "recipient-copy", kind: 1059, tags: [["p", "recipient-pubkey"]] },
    ]);
    publishMock.mockImplementation((relays: string[], event: { id: string }) =>
      relays.map((relay) => Promise.resolve(`ok:${relay}:${event.id}`)),
    );

    const { NostrDmNotificationSender } =
      await import("../src/infra/notify/NostrDmNotificationSender");

    const sender = new NostrDmNotificationSender({
      relays: ["wss://relay.damus.io", "wss://relay.primal.net"],
      recipientNpub: "recipient-npub",
      identityRepo: {
        getOrCreateNotifierIdentity: () => ({
          nsec: "sender-nsec",
          npub: "sender-npub",
          pubkey: "sender-pubkey",
        }),
      } as any,
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    });

    await sender.initialize();
    await sender.sendMatchNotification({
      watchlist: {
        id: "wl-1",
        name: "Alerts",
        prompt: "Track mentions",
        filters: {},
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      event: {
        id: "evt-1",
        pubkey: "author-pubkey",
        created_at: 1700000001,
        kind: 1,
        tags: [],
        content: "hello nostr",
      },
      aiDecision: {
        notify: true,
        message: "Match detected",
      },
    });

    expect(wrapManyEventsMock).toHaveBeenCalledTimes(1);
    expect(wrapManyEventsMock).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3, 4]),
      [{ publicKey: "recipient-pubkey" }],
      expect.stringContaining("Match detected"),
    );

    expect(querySyncMock).toHaveBeenCalledWith(
      [
        "wss://relay.damus.io",
        "wss://relay.primal.net",
        "wss://purplepag.es",
        "wss://nos.lol",
      ],
      {
        authors: ["recipient-pubkey"],
        kinds: [10050],
        limit: 1,
      },
      { maxWait: 2000 },
    );

    expect(publishMock).toHaveBeenNthCalledWith(
      1,
      ["wss://relay.damus.io", "wss://relay.primal.net", "wss://dm.one"],
      { id: "recipient-copy", kind: 1059, tags: [["p", "recipient-pubkey"]] },
    );
    expect(publishMock).toHaveBeenNthCalledWith(
      2,
      ["wss://relay.damus.io", "wss://relay.primal.net"],
      { id: "sender-copy", kind: 1059, tags: [["p", "sender-pubkey"]] },
    );
  });
});
