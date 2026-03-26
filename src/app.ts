import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import { z } from "zod";
import {
  ProcessingRepository,
  WatchlistRepository,
} from "./infra/repositories";
import type { WatchlistFilter } from "./types";

const watchlistCreateSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(3),
  active: z.boolean().optional(),
  filters: z
    .object({
      keywords: z.array(z.string().min(1)).optional(),
      authors: z.array(z.string().min(1)).optional(),
      kinds: z.array(z.number().int()).optional(),
      tags: z.record(z.array(z.string().min(1))).optional(),
    })
    .default({}),
});

const watchlistPatchSchema = z.object({
  active: z.boolean(),
});

const insightQuerySchema = z.object({
  watchlistId: z.string().optional(),
  sinceMinutes: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const bridgeQuerySchema = z.object({
  query: z.string().min(2),
  sinceMinutes: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export function createApp(
  deps: {
    watchlistRepo: WatchlistRepository;
    processingRepo: ProcessingRepository;
    onWatchlistsChanged?: () => void;
  },
  fastifyOptions?: FastifyServerOptions,
): FastifyInstance {
  const app = Fastify(fastifyOptions);

  app.get("/health", async () => ({
    status: "ok",
    watchlists: deps.watchlistRepo.list().length,
  }));

  app.get("/watchlists", async () => ({
    data: deps.watchlistRepo.list(),
  }));

  app.post(
    "/watchlists",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = watchlistCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const filters = parsed.data.filters as WatchlistFilter;
      const watchlist = deps.watchlistRepo.create({
        name: parsed.data.name,
        prompt: parsed.data.prompt,
        active: parsed.data.active,
        filters,
      });

      deps.onWatchlistsChanged?.();

      return reply.status(201).send({ data: watchlist });
    },
  );

  app.patch(
    "/watchlists/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsedBody = watchlistPatchSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: parsedBody.error.flatten() });
      }

      const params = request.params as { id?: string };
      if (!params.id) {
        return reply.status(400).send({ error: "missing watchlist id" });
      }

      const updated = deps.watchlistRepo.setActive(
        params.id,
        parsedBody.data.active,
      );
      if (!updated) {
        return reply.status(404).send({ error: "watchlist not found" });
      }

      deps.onWatchlistsChanged?.();

      return { data: updated };
    },
  );

  app.get("/insights", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = insightQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    return {
      data: deps.processingRepo.listInsights(parsed.data),
    };
  });

  app.post(
    "/bridge/query",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bridgeQuerySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const hits = deps.processingRepo.queryInsightsByText(parsed.data);

      return {
        query: parsed.data.query,
        count: hits.length,
        data: hits,
      };
    },
  );

  app.post("/admin/wipe-processed", async () => {
    const deleted = deps.processingRepo.wipeProcessedEvents();
    return { deleted };
  });

  return app;
}
