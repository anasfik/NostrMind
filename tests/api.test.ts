import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config";

describe("config mode smoke", () => {
  it("loads the example config shape", () => {
    const config = getConfig("./nostr-claw.config.json.example");

    expect(config.nostrRelays.length).toBeGreaterThan(0);
    expect(config.watchlists.length).toBeGreaterThan(0);
    expect(config.aiProvider).toBe("openai");
  });
});
