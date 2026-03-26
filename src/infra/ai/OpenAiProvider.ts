import OpenAI from "openai";
import type { AiProvider } from "../../contracts";
import type { AiDecision, AiEvaluationInput } from "../../types";

const OUTPUT_INSTRUCTION =
  'Return strict JSON only: {"notify": boolean, "message": string, "actionable_link": string, "recommended_actions": string[], "match_score": number}. If no signal, return {"notify": false}.';

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async evaluate(input: AiEvaluationInput): Promise<AiDecision> {
    const system = [
      "You are Nostr-Claw intelligence gate.",
      "Reject spam, bots, low-signal chatter.",
      OUTPUT_INSTRUCTION,
    ].join(" ");

    const user = {
      watchlist_name: input.watchlist.name,
      watchlist_prompt: input.watchlist.prompt,
      watchlist_filters: input.watchlist.filters,
      event: {
        id: input.event.id,
        pubkey: input.event.pubkey,
        kind: input.event.kind,
        created_at: input.event.created_at,
        tags: input.event.tags,
        content: input.event.content,
      },
    };

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return { notify: false };

    try {
      const parsed = JSON.parse(text) as AiDecision;
      if (typeof parsed.notify !== "boolean") return { notify: false };
      return parsed;
    } catch {
      return { notify: false };
    }
  }
}
