import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.string().default("info"),
  LOG_FILE_PATH: z.string().default("./log.txt"),
  DB_PATH: z.string().default("./nostr-claw.sqlite"),
  NOSTR_RELAYS: z
    .string()
    .default("wss://relay.damus.io,wss://relay.primal.net,wss://nos.lol"),
  AI_PROVIDER: z.enum(["openai", "openrouter"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o-mini"),
  NOTIFY_RECIPIENT_NPUB: z.string().optional(),
  WATCHLIST_REFRESH_MS: z.coerce.number().int().positive().default(15000),
  // Max AI requests per minute. 0 = unlimited.
  AI_RPM: z.coerce.number().int().min(0).default(20),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: string;
  logFilePath: string;
  dbPath: string;
  nostrRelays: string[];
  aiProvider: "openai" | "openrouter";
  openAiApiKey?: string;
  openAiModel: string;
  openRouterApiKey?: string;
  openRouterModel: string;
  notifyRecipientNpub?: string;
  watchlistRefreshMs: number;
  aiRpm: number;
};

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    logFilePath: parsed.LOG_FILE_PATH,
    dbPath: parsed.DB_PATH,
    nostrRelays: parsed.NOSTR_RELAYS.split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    aiProvider: parsed.AI_PROVIDER,
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiModel: parsed.OPENAI_MODEL,
    openRouterApiKey: parsed.OPENROUTER_API_KEY,
    openRouterModel: parsed.OPENROUTER_MODEL,
    notifyRecipientNpub: parsed.NOTIFY_RECIPIENT_NPUB,
    watchlistRefreshMs: parsed.WATCHLIST_REFRESH_MS,
    aiRpm: parsed.AI_RPM,
  };
}
