#!/usr/bin/env node
require("dotenv").config();

const WebSocket = require("ws");
const Database = require("better-sqlite3");
const { SimplePool, nip19, getPublicKey, nip17 } = require("nostr-tools");

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
}

const RELAY_TAGS = new Set(["r", "relay"]);

function normalizeRelay(relay) {
  const value = relay?.trim();
  if (!value) return undefined;
  if (!value.startsWith("wss://") && !value.startsWith("ws://"))
    return undefined;
  return value;
}

async function main() {
  const receiverNsec = process.argv[2];
  if (!receiverNsec) {
    throw new Error(
      "Usage: node scripts/fetch-receiver-dms.js <receiver_nsec>",
    );
  }

  const decoded = nip19.decode(receiverNsec);
  if (decoded.type !== "nsec") {
    throw new Error("Provided key is not a valid nsec");
  }

  const receiverSecretKey = decoded.data;
  const receiverPubkey = getPublicKey(decoded.data);

  const db = new Database("./nostr-claw.sqlite", { readonly: true });
  const notifierPubkey = db
    .prepare("SELECT value FROM app_settings WHERE key='notifier_pubkey'")
    .get()?.value;
  db.close();

  const relays = (process.env.NOSTR_RELAYS || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  if (relays.length === 0) {
    throw new Error("No relays configured in NOSTR_RELAYS");
  }

  const since = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
  const pool = new SimplePool();

  const relayList = await pool.get(
    relays,
    {
      authors: [receiverPubkey],
      kinds: [10050],
      limit: 1,
    },
    { maxWait: 4000 },
  );

  const dmRelaysFrom10050 = relayList
    ? relayList.tags
        .filter((tag) => RELAY_TAGS.has(tag[0]))
        .map((tag) => normalizeRelay(tag[1]))
        .filter(Boolean)
    : [];

  const allRelays = [...new Set([...relays, ...dmRelaysFrom10050])];

  const wrappedEvents = await pool.querySync(
    allRelays,
    { kinds: [1059], "#p": [receiverPubkey], since, limit: 200 },
    { maxWait: 6000 },
  );

  const decrypted = [];
  for (const wrap of wrappedEvents) {
    try {
      const dm = nip17.unwrapEvent(wrap, receiverSecretKey);
      if (notifierPubkey && dm.pubkey !== notifierPubkey) {
        continue;
      }
      decrypted.push({
        wrapId: wrap.id,
        dmId: dm.id,
        createdAt: dm.created_at,
        senderPubkey: dm.pubkey,
        content: dm.content,
      });
    } catch {
      // Ignore wraps that can't be decrypted by this recipient nsec
    }
  }

  decrypted.sort((a, b) => b.createdAt - a.createdAt);

  console.log(
    JSON.stringify(
      {
        receiverPubkey,
        notifierPubkey: notifierPubkey || null,
        configuredRelays: relays,
        dmRelaysFrom10050,
        queriedRelays: allRelays,
        wrappedEventsFound: wrappedEvents.length,
        decryptedFromNotifier: decrypted.length,
        messages: decrypted.slice(0, 10),
      },
      null,
      2,
    ),
  );

  pool.close(allRelays);
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
