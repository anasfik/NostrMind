import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config";
import { initDb } from "../src/infra/db";
import { WatchlistRepository } from "../src/infra/repositories";

describe("config-file mode", () => {
  it("loads JSON config and resolves relative paths", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "nostr-claw-config-"));
    const configPath = path.join(tempDir, "nostr-claw.config.json");

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          logFilePath: "./custom.log",
          dbPath: "./custom.sqlite",
          nostrRelays: ["wss://relay.damus.io"],
          ai: {
            provider: "openai",
            rpm: 10,
            openai: {
              apiKey: "test-key",
              model: "gpt-test",
            },
          },
          notifications: {
            recipientNpub: "npub1test",
          },
          watchlists: [
            {
              id: "jobs",
              name: "Jobs",
              prompt: "Find job posts",
              filters: {
                keywords: ["jobs"],
                since: 1735689600,
                limit: 25,
              },
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const config = getConfig(configPath);

    expect(config.configPath).toBe(configPath);
    expect(config.logFilePath).toBe(path.join(tempDir, "custom.log"));
    expect(config.dbPath).toBe(path.join(tempDir, "custom.sqlite"));
    expect(config.aiProvider).toBe("openai");
    expect(config.openAiApiKey).toBe("test-key");
    expect(config.watchlists[0].id).toBe("jobs");
  });

  it("syncs config watchlists into SQLite and disables removed ones", () => {
    const db = initDb(":memory:");
    const repo = new WatchlistRepository(db);

    repo.syncFromConfig([
      {
        id: "alpha",
        name: "Alpha",
        prompt: "Track alpha",
        active: true,
        filters: { keywords: ["alpha"], since: 1735689600, limit: 10 },
      },
      {
        id: "beta",
        name: "Beta",
        prompt: "Track beta",
        active: true,
        filters: { keywords: ["beta"], since: 1735689600, limit: 10 },
      },
    ]);

    repo.syncFromConfig([
      {
        id: "alpha",
        name: "Alpha updated",
        prompt: "Track alpha updates",
        active: true,
        filters: {
          keywords: ["alpha", "updates"],
          since: 1735689600,
          limit: 20,
        },
      },
    ]);

    const all = repo.list();
    const alpha = all.find((watchlist) => watchlist.id === "alpha");
    const beta = all.find((watchlist) => watchlist.id === "beta");

    expect(alpha?.name).toBe("Alpha updated");
    expect(alpha?.active).toBe(true);
    expect(alpha?.filters.since).toBe(1735689600);
    expect(alpha?.filters.limit).toBe(20);
    expect(beta?.active).toBe(false);
  });
});
