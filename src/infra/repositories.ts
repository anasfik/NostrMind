import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import type {
  AiDecision,
  InsightRecord,
  Watchlist,
  WatchlistFilter,
} from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

export interface NostrIdentity {
  nsec: string;
  npub: string;
  pubkey: string;
}

function parseWatchlistRow(row: any): Watchlist {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    filters: JSON.parse(row.filters_json),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WatchlistRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Watchlist[] {
    const rows = this.db
      .prepare("SELECT * FROM watchlists ORDER BY created_at DESC")
      .all();
    return rows.map(parseWatchlistRow);
  }

  listActive(): Watchlist[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM watchlists WHERE active = 1 ORDER BY created_at DESC",
      )
      .all();
    return rows.map(parseWatchlistRow);
  }

  create(input: {
    name: string;
    prompt: string;
    filters: WatchlistFilter;
    active?: boolean;
  }): Watchlist {
    const id = crypto.randomUUID();
    const now = nowIso();
    const nowUnix = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    // Auto-set since to current time if not provided
    const filters = {
      ...input.filters,
      since: input.filters.since ?? nowUnix,
    };

    this.db
      .prepare(
        `INSERT INTO watchlists (id, name, prompt, filters_json, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.prompt,
        JSON.stringify(filters),
        input.active === false ? 0 : 1,
        now,
        now,
      );

    return this.getById(id)!;
  }

  getById(id: string): Watchlist | null {
    const row = this.db
      .prepare("SELECT * FROM watchlists WHERE id = ?")
      .get(id);
    return row ? parseWatchlistRow(row) : null;
  }

  setActive(id: string, active: boolean): Watchlist | null {
    const now = nowIso();
    this.db
      .prepare("UPDATE watchlists SET active = ?, updated_at = ? WHERE id = ?")
      .run(active ? 1 : 0, now, id);
    return this.getById(id);
  }
}

export class ProcessingRepository {
  constructor(private readonly db: Database.Database) {}

  hasProcessed(eventId: string, watchlistId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM processed_events WHERE event_id = ? AND watchlist_id = ?",
      )
      .get(eventId, watchlistId);
    return Boolean(row);
  }

  logProcessed(input: {
    eventId: string;
    watchlistId: string;
    eventTimestamp: number;
    contentHash: string;
    aiDecision: AiDecision;
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO processed_events
         (event_id, watchlist_id, event_timestamp, content_hash, ai_output_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.eventId,
        input.watchlistId,
        input.eventTimestamp,
        input.contentHash,
        JSON.stringify(input.aiDecision),
        nowIso(),
      );
  }

  wipeProcessedEvents(): number {
    const result = this.db.prepare("DELETE FROM processed_events").run();
    return result.changes;
  }

  addInsight(input: {
    watchlistId: string;
    eventId: string;
    eventPubkey: string;
    eventCreatedAt: number;
    content: string;
    aiDecision: AiDecision;
  }): void {
    this.db
      .prepare(
        `INSERT INTO insights
         (watchlist_id, event_id, event_pubkey, event_created_at, content, message, actionable_link,
          recommended_actions_json, match_score, ai_decision_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.watchlistId,
        input.eventId,
        input.eventPubkey,
        input.eventCreatedAt,
        input.content,
        input.aiDecision.message ?? null,
        input.aiDecision.actionable_link ?? null,
        JSON.stringify(input.aiDecision.recommended_actions ?? []),
        input.aiDecision.match_score ?? null,
        JSON.stringify(input.aiDecision),
        nowIso(),
      );
  }

  listInsights(input: {
    watchlistId?: string;
    sinceMinutes?: number;
    limit?: number;
  }): InsightRecord[] {
    const sinceMinutes = input.sinceMinutes ?? 60;
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const sinceIso = new Date(Date.now() - sinceMinutes * 60_000).toISOString();

    const rows = input.watchlistId
      ? this.db
          .prepare(
            `SELECT watchlist_id, event_id, event_pubkey, event_created_at, content, ai_decision_json, created_at
             FROM insights
             WHERE created_at >= ? AND watchlist_id = ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(sinceIso, input.watchlistId, limit)
      : this.db
          .prepare(
            `SELECT watchlist_id, event_id, event_pubkey, event_created_at, content, ai_decision_json, created_at
             FROM insights
             WHERE created_at >= ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(sinceIso, limit);

    return rows.map((row: any) => ({
      watchlistId: row.watchlist_id,
      eventId: row.event_id,
      eventPubkey: row.event_pubkey,
      eventCreatedAt: row.event_created_at,
      content: row.content,
      aiDecision: JSON.parse(row.ai_decision_json),
      createdAt: row.created_at,
    }));
  }

  queryInsightsByText(input: {
    query: string;
    sinceMinutes?: number;
    limit?: number;
  }): InsightRecord[] {
    const sinceMinutes = input.sinceMinutes ?? 60;
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const sinceIso = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
    const q = `%${input.query.toLowerCase()}%`;

    const rows = this.db
      .prepare(
        `SELECT watchlist_id, event_id, event_pubkey, event_created_at, content, ai_decision_json, created_at
         FROM insights
         WHERE created_at >= ?
           AND (
             LOWER(content) LIKE ?
             OR LOWER(ai_decision_json) LIKE ?
           )
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(sinceIso, q, q, limit);

    return rows.map((row: any) => ({
      watchlistId: row.watchlist_id,
      eventId: row.event_id,
      eventPubkey: row.event_pubkey,
      eventCreatedAt: row.event_created_at,
      content: row.content,
      aiDecision: JSON.parse(row.ai_decision_json),
      createdAt: row.created_at,
    }));
  }
}

export class AppIdentityRepository {
  constructor(private readonly db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, now, now);
  }

  getOrCreateNotifierIdentity(): NostrIdentity {
    const existingNsec = this.get("notifier_nsec");
    const existingNpub = this.get("notifier_npub");
    const existingPubkey = this.get("notifier_pubkey");

    if (existingNsec && existingNpub && existingPubkey) {
      return {
        nsec: existingNsec,
        npub: existingNpub,
        pubkey: existingPubkey,
      };
    }

    const secretKey = generateSecretKey();
    const nsec = nip19.nsecEncode(secretKey);
    const hexPubkey = getPublicKey(secretKey);
    const npub = nip19.npubEncode(hexPubkey);

    this.set("notifier_nsec", nsec);
    this.set("notifier_npub", npub);
    this.set("notifier_pubkey", hexPubkey);

    return {
      nsec,
      npub,
      pubkey: hexPubkey,
    };
  }
}
