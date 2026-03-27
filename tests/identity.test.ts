import { describe, expect, it } from "vitest";
import { initDb } from "../src/infra/db";
import { AppIdentityRepository } from "../src/infra/repositories";

describe("AppIdentityRepository", () => {
  it("generates and reuses a persistent notifier identity", () => {
    const db = initDb(":memory:");
    const repo = new AppIdentityRepository(db);

    const first = repo.getOrCreateNotifierIdentity();
    const second = repo.getOrCreateNotifierIdentity();

    expect(first.nsec.startsWith("nsec1")).toBe(true);
    expect(first.npub.startsWith("npub1")).toBe(true);
    expect(first.pubkey).toHaveLength(64);
    expect(second).toEqual(first);
  });

  it("accepts a configured notifier sender key", () => {
    const db = initDb(":memory:");
    const repo = new AppIdentityRepository(db);

    const identity = repo.setNotifierIdentity(
      "1111111111111111111111111111111111111111111111111111111111111111",
    );

    expect(identity.nsec.startsWith("nsec1")).toBe(true);
    expect(identity.npub.startsWith("npub1")).toBe(true);
    expect(repo.getOrCreateNotifierIdentity()).toEqual(identity);
  });
});
