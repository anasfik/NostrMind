import type {
  AiDecision,
  AiEvaluationInput,
  NostrEvent,
  Watchlist,
} from "./types";

export interface AiProvider {
  evaluate(input: AiEvaluationInput): Promise<AiDecision>;
}

export interface RelayFilter {
  kinds?: number[];
  authors?: string[];
  since?: number; // Unix timestamp (seconds) - ignore events before this
  limit?: number;
  [key: `#${string}`]: string[] | number[] | string[] | undefined;
}

export interface RelayConnector {
  start(filters: RelayFilter[]): void;
  stop(): void;
  onEvent(handler: (event: NostrEvent) => void): () => void;
}

export interface NotificationSender {
  initialize?(): Promise<void>;
  sendMatchNotification(input: {
    watchlist: Watchlist;
    event: NostrEvent;
    aiDecision: AiDecision;
  }): Promise<void>;
}
