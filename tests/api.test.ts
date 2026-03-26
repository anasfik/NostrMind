import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { initDb } from "../src/infra/db";
import {
  ProcessingRepository,
  WatchlistRepository,
} from "../src/infra/repositories";
import type { FastifyInstance } from "fastify";

describe("api", () => {
  let app: FastifyInstance;
  let processingRepo: ProcessingRepository;

  beforeEach(async () => {
    const db = initDb(":memory:");
    const watchlistRepo = new WatchlistRepository(db);
    processingRepo = new ProcessingRepository(db);
    app = createApp({ watchlistRepo, processingRepo }, { logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates and lists watchlists", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/watchlists",
      payload: {
        name: "Flutter leads",
        prompt: "Find people looking for flutter developers",
        filters: { keywords: ["flutter", "developer"], kinds: [1] },
      },
    });

    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: "GET", url: "/watchlists" });
    expect(listRes.statusCode).toBe(200);
    const body = listRes.json() as { data: Array<{ name: string }> };
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe("Flutter leads");
  });

  it("answers bridge query from stored insights", async () => {
    const wl = (
      await app.inject({
        method: "POST",
        url: "/watchlists",
        payload: {
          name: "BTC L2",
          prompt: "Monitor bitcoin l2 chatter",
          filters: { keywords: ["bitcoin", "l2"] },
        },
      })
    ).json() as { data: { id: string } };

    processingRepo.addInsight({
      watchlistId: wl.data.id,
      eventId: "evt-abc",
      eventPubkey: "pk-1",
      eventCreatedAt: Math.floor(Date.now() / 1000),
      content: "Big discussion about Bitcoin L2s this morning",
      aiDecision: {
        notify: true,
        message: "Strong market signal",
        actionable_link: "https://njump.me/evt-abc",
        recommended_actions: ["Track sentiment"],
        match_score: 0.93,
      },
    });

    const queryRes = await app.inject({
      method: "POST",
      url: "/bridge/query",
      payload: { query: "bitcoin l2", sinceMinutes: 120 },
    });

    expect(queryRes.statusCode).toBe(200);
    const payload = queryRes.json() as { count: number };
    expect(payload.count).toBe(1);
  });
});
