import type { NostrEvent, WatchlistFilter } from "../types";

export interface QuickFilterContext {
  isProcessed?: boolean;
}

function normalize(input: string): string {
  return input.toLowerCase();
}

function tagsToMap(tags: string[][]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const tag of tags) {
    const [key, value] = tag;
    if (!key || !value) continue;
    if (!map[key]) map[key] = new Set();
    map[key].add(value);
  }
  return map;
}

export function matchesQuickFilter(
  event: NostrEvent,
  filter: WatchlistFilter,
  context: QuickFilterContext = {},
): boolean {
  if (
    (filter.since !== undefined && event.created_at < filter.since) ||
    context.isProcessed
  ) {
    return false;
  }

  if (filter.kinds?.length && !filter.kinds.includes(event.kind)) {
    return false;
  }

  if (filter.authors?.length && !filter.authors.includes(event.pubkey)) {
    return false;
  }

  if (filter.keywords?.length) {
    const content = normalize(event.content);
    const hasKeyword = filter.keywords.some((k) =>
      content.includes(normalize(k)),
    );
    if (!hasKeyword) {
      return false;
    }
  }

  if (filter.tags && Object.keys(filter.tags).length > 0) {
    const eventTagsMap = tagsToMap(event.tags);
    for (const [key, values] of Object.entries(filter.tags)) {
      const eventValues = eventTagsMap[key];
      if (!eventValues) {
        return false;
      }
      const expected = values.map(normalize);
      const hit = [...eventValues].some((v) => expected.includes(normalize(v)));
      if (!hit) {
        return false;
      }
    }
  }

  return true;
}
