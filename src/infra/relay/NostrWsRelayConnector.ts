import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { RelayConnector, RelayFilter } from "../../contracts";
import type { NostrEvent } from "../../types";

type NostrMessage = [string, ...unknown[]];

export class NostrWsRelayConnector implements RelayConnector {
  private readonly emitter = new EventEmitter();
  private readonly sockets = new Map<string, WebSocket>();
  private stopped = true;
  private subscriptionId = "";
  private filters: RelayFilter[] = [];

  constructor(
    private readonly relays: string[],
    private readonly reconnectMs = 5000,
  ) {}

  onEvent(handler: (event: NostrEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  start(filters: RelayFilter[]): void {
    this.filters = filters.length ? filters : [{ kinds: [1] }];
    this.subscriptionId = `nostr-claw-${crypto.randomUUID()}`;
    this.stopped = false;

    for (const relay of this.relays) {
      this.connectRelay(relay);
    }
  }

  stop(): void {
    this.stopped = true;
    for (const socket of this.sockets.values()) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
    this.sockets.clear();
  }

  private connectRelay(relay: string): void {
    if (this.stopped || this.sockets.has(relay)) return;

    const ws = new WebSocket(relay);
    this.sockets.set(relay, ws);

    ws.on("open", () => {
      const req = ["REQ", this.subscriptionId, ...this.filters];
      ws.send(JSON.stringify(req));
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(String(data)) as NostrMessage;
        if (parsed[0] !== "EVENT") return;
        const event = parsed[2] as NostrEvent;
        if (event?.id) {
          this.emitter.emit("event", event);
        }
      } catch {
        // ignore invalid messages
      }
    });

    ws.on("close", () => {
      this.sockets.delete(relay);
      if (!this.stopped) {
        setTimeout(() => this.connectRelay(relay), this.reconnectMs);
      }
    });

    ws.on("error", () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    });
  }
}
