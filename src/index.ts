import "dotenv/config";
import { getConfig } from "./config";
import type { AiProvider } from "./contracts";
import { createApp } from "./app";
import { OpenAiProvider } from "./infra/ai/OpenAiProvider";
import { OpenRouterProvider } from "./infra/ai/OpenRouterProvider";
import { initDb } from "./infra/db";
import { NostrDmNotificationSender } from "./infra/notify/NostrDmNotificationSender";
import {
  AppIdentityRepository,
  ProcessingRepository,
  WatchlistRepository,
} from "./infra/repositories";
import { NostrWsRelayConnector } from "./infra/relay/NostrWsRelayConnector";
import { AiQueue } from "./services/AiQueue";
import { PipelineService } from "./services/PipelineService";

async function main(): Promise<void> {
  const config = getConfig();
  const db = initDb(config.dbPath);
  const watchlistRepo = new WatchlistRepository(db);
  const processingRepo = new ProcessingRepository(db);
  const identityRepo = new AppIdentityRepository(db);

  let aiProvider: AiProvider;
  if (config.aiProvider === "openai") {
    if (!config.openAiApiKey) {
      throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
    }
    aiProvider = new OpenAiProvider(config.openAiApiKey, config.openAiModel);
  } else if (config.aiProvider === "openrouter") {
    if (!config.openRouterApiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter",
      );
    }
    aiProvider = new OpenRouterProvider(
      config.openRouterApiKey,
      config.openRouterModel,
    );
  } else {
    throw new Error(`Unsupported AI_PROVIDER: ${config.aiProvider}`);
  }

  const relayConnector = new NostrWsRelayConnector(config.nostrRelays);

  let pipeline: PipelineService | undefined;

  const app = createApp(
    {
      watchlistRepo,
      processingRepo,
      onWatchlistsChanged: () => pipeline?.refreshWatchlistsAndSubscriptions(),
    },
    {
      logger:
        config.nodeEnv === "development"
          ? {
              level: config.logLevel,
              transport: {
                target: "pino-pretty",
                options: { colorize: true },
              },
            }
          : { level: config.logLevel },
    },
  );

  const notificationSender = config.notifyRecipientNpub
    ? new NostrDmNotificationSender({
        relays: config.nostrRelays,
        recipientNpub: config.notifyRecipientNpub,
        identityRepo,
        logger: app.log,
      })
    : undefined;

  await notificationSender?.initialize?.();

  const aiQueue = new AiQueue(config.aiRpm, (waitMs) =>
    app.log.warn(
      { waitMs, pending: aiQueue.pending },
      "AI rate limit reached, throttling next request",
    ),
  );

  pipeline = new PipelineService({
    relayConnector,
    watchlistRepo,
    processingRepo,
    aiProvider,
    aiQueue,
    notificationSender,
    logFilePath: config.logFilePath,
    watchlistRefreshMs: config.watchlistRefreshMs,
    logger: app.log,
  });

  pipeline.start();

  app.addHook("onClose", async () => {
    pipeline?.stop();
    db.close();
  });

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
