import crypto from "node:crypto";
import { appendFile } from "node:fs/promises";
import type { FastifyBaseLogger } from "fastify";
import type {
  AiProvider,
  NotificationSender,
  RelayConnector,
  RelayFilter,
} from "../contracts";
import { matchesQuickFilter } from "../domain/filter";
import {
  ProcessingRepository,
  WatchlistRepository,
} from "../infra/repositories";
import type { Watchlist } from "../types";
import { AiQueue } from "./AiQueue";

export class PipelineService {
  private watchlists: Watchlist[] = [];
  private unbindRelay?: () => void;
  private refreshTimer?: NodeJS.Timeout;

  constructor(
    private readonly deps: {
      relayConnector: RelayConnector;
      watchlistRepo: WatchlistRepository;
      processingRepo: ProcessingRepository;
      aiProvider: AiProvider;
      aiQueue: AiQueue;
      notificationSender?: NotificationSender;
      logger: FastifyBaseLogger;
      logFilePath: string;
      watchlistRefreshMs: number;
    },
  ) {}

  private async appendProcessingLog(input: {
    watchlist: Watchlist;
    event: {
      id: string;
      created_at: number;
      content: string;
      pubkey: string;
      kind: number;
      tags: string[][];
    };
    aiDecision: { notify: boolean; message?: string; match_score?: number };
  }): Promise<void> {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      watchlistId: input.watchlist.id,
      watchlistName: input.watchlist.name,
      eventId: input.event.id,
      eventPubkey: input.event.pubkey,
      eventKind: input.event.kind,
      eventCreatedAt: input.event.created_at,
      notify: input.aiDecision.notify,
      matchScore: input.aiDecision.match_score ?? null,
      message: input.aiDecision.message ?? null,
      content: input.event.content,
    });

    await appendFile(this.deps.logFilePath, `${line}\n`, "utf8");
  }

  start(): void {
    this.refreshWatchlistsAndSubscriptions();
    this.unbindRelay = this.deps.relayConnector.onEvent((event) => {
      void this.handleEvent(event);
    });

    this.refreshTimer = setInterval(() => {
      this.refreshWatchlistsAndSubscriptions();
    }, this.deps.watchlistRefreshMs);
  }

  stop(): void {
    if (this.unbindRelay) {
      this.unbindRelay();
      this.unbindRelay = undefined;
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.deps.relayConnector.stop();
  }

  refreshWatchlistsAndSubscriptions(): void {
    this.watchlists = this.deps.watchlistRepo.listActive();
    const filters = this.toRelayFilters(this.watchlists);
    this.deps.relayConnector.stop();
    this.deps.relayConnector.start(filters);
  }

  private toRelayFilters(watchlists: Watchlist[]): RelayFilter[] {
    if (watchlists.length === 0) {
      return [{ kinds: [1], limit: 1 }];
    }

    return watchlists.map((watchlist) => {
      const filter: RelayFilter = {};

      // Include since timestamp from watchlist creation
      if (watchlist.filters.since !== undefined) {
        filter.since = watchlist.filters.since;
      }

      if (watchlist.filters.kinds?.length) {
        filter.kinds = [...new Set(watchlist.filters.kinds)];
      }

      if (watchlist.filters.authors?.length) {
        filter.authors = [...new Set(watchlist.filters.authors)];
      }

      for (const [tagKey, values] of Object.entries(
        watchlist.filters.tags ?? {},
      )) {
        if (values.length > 0) {
          filter[`#${tagKey}`] = [...new Set(values)];
        }
      }

      if (
        !filter.kinds &&
        !filter.authors &&
        !filter.since &&
        Object.keys(filter).length === 0
      ) {
        filter.kinds = [1];
      }

      filter.limit = 1;
      return filter;
    });
  }

  private async handleEvent(event: {
    id: string;
    created_at: number;
    content: string;
    pubkey: string;
    kind: number;
    tags: string[][];
  }): Promise<void> {
    for (const watchlist of this.watchlists) {
      try {
        const isProcessed = this.deps.processingRepo.hasProcessed(
          event.id,
          watchlist.id,
        );

        if (!matchesQuickFilter(event, watchlist.filters, { isProcessed })) {
          continue;
        }

        const aiDecision = await this.deps.aiQueue.enqueue(() =>
          this.deps.aiProvider.evaluate({ watchlist, event }),
        );

        const hash = crypto
          .createHash("sha256")
          .update(event.content)
          .digest("hex");
        this.deps.processingRepo.logProcessed({
          eventId: event.id,
          watchlistId: watchlist.id,
          eventTimestamp: event.created_at,
          contentHash: hash,
          aiDecision,
        });

        await this.appendProcessingLog({
          watchlist,
          event,
          aiDecision,
        });

        if (aiDecision.notify) {
          this.deps.processingRepo.addInsight({
            watchlistId: watchlist.id,
            eventId: event.id,
            eventPubkey: event.pubkey,
            eventCreatedAt: event.created_at,
            content: event.content,
            aiDecision,
          });

          await this.deps.notificationSender?.sendMatchNotification({
            watchlist,
            event,
            aiDecision,
          });
        }
      } catch (error) {
        this.deps.logger.error(
          { error, eventId: event.id, watchlistId: watchlist.id },
          "event processing failed",
        );
      }
    }
  }
}
