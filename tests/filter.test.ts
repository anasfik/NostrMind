import { describe, expect, it } from "vitest";
import { matchesQuickFilter } from "../src/domain/filter";
import type { NostrEvent } from "../src/types";

const baseEvent: NostrEvent = {
  id: "evt-1",
  pubkey: "author-1",
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ["t", "bitcoin"],
    ["client", "damus"],
  ],
  content: "Looking for a Flutter developer to build a nostr mobile app",
};

describe("matchesQuickFilter", () => {
  it("matches keyword + kind + tag", () => {
    const result = matchesQuickFilter(baseEvent, {
      keywords: ["flutter", "developer"],
      kinds: [1],
      tags: { t: ["bitcoin"] },
    });

    expect(result).toBe(true);
  });

  it("rejects mismatched author", () => {
    const result = matchesQuickFilter(baseEvent, {
      authors: ["someone-else"],
    });

    expect(result).toBe(false);
  });

  it("rejects already processed events", () => {
    const result = matchesQuickFilter(
      baseEvent,
      {
        keywords: ["flutter"],
      },
      { isProcessed: true },
    );

    expect(result).toBe(false);
  });
});
