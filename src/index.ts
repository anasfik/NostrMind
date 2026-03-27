import { getConfig } from "./config";
import type { AiProvider } from "./contracts";
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
import { createLogger } from "./logger";
import { AiQueue } from "./services/AiQueue";
import { PipelineService } from "./services/PipelineService";

async function main(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logLevel);
  const db = initDb(config.dbPath);
  const watchlistRepo = new WatchlistRepository(db);
  const processingRepo = new ProcessingRepository(db);
  const identityRepo = new AppIdentityRepository(db);

  if (config.notifierSenderNsec) {
    identityRepo.setNotifierIdentity(config.notifierSenderNsec);
  }

  const syncedWatchlists = watchlistRepo.syncFromConfig(config.watchlists);

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

  const relayConnector = new NostrWsRelayConnector(
    config.nostrRelays,
    5000,
    logger,
  );

  const notificationSender = config.notifyRecipientNpub
    ? new NostrDmNotificationSender({
        relays: config.nostrRelays,
        recipientNpub: config.notifyRecipientNpub,
        identityRepo,
        logger,
      })
    : undefined;

  await notificationSender?.initialize?.();

  const aiQueue = new AiQueue(config.aiRpm, (waitMs) =>
    logger.warn(
      { waitMs, pending: aiQueue.pending },
      "AI rate limit reached, throttling next request",
    ),
  );

  const pipeline = new PipelineService({
    relayConnector,
    watchlistRepo,
    processingRepo,
    aiProvider,
    aiQueue,
    notificationSender,
    logFilePath: config.logFilePath,
    watchlistRefreshMs: config.watchlistRefreshMs,
    logger,
  });

  pipeline.start();

  logger.info(
    {
      configPath: config.configPath,
      dbPath: config.dbPath,
      relayCount: config.nostrRelays.length,
      watchlistCount: syncedWatchlists.filter((watchlist) => watchlist.active)
        .length,
      notifyRecipientNpub: config.notifyRecipientNpub ?? null,
    },
    "nostr-claw started in config-file mode",
  );

  logger.debug(
    {
      aiProvider: config.aiProvider,
      aiModel:
        config.aiProvider === "openrouter"
          ? config.openRouterModel
          : config.openAiModel,
      aiRpm: config.aiRpm,
      watchlists: syncedWatchlists.map((watchlist) => ({
        id: watchlist.id,
        name: watchlist.name,
        active: watchlist.active,
        since: watchlist.filters.since,
        limit: watchlist.filters.limit,
      })),
    },
    "runtime configuration snapshot",
  );

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info("shutting down nostr-claw");
    pipeline.stop();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise<void>(() => undefined);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
