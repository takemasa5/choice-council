import OpenAI from "openai";
import { z } from "zod";
import type { LlmProvider, StructuredOutputRequest } from "./types";

const groqBaseUrl = "https://api.groq.com/openai/v1";

/** Groq Chat Completions API で構造化出力を生成するプロバイダー。 */
export class GroqLlmProvider implements LlmProvider {
  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly client = new OpenAI({ apiKey, baseURL: groqBaseUrl }),
    private readonly maxCompletionTokens = 1200,
  ) {}

  /** Groq の開発者・ユーザーメッセージとJSON Schemaを使って構造化出力を取得する。 */
  async generateStructuredOutput<T>({
    systemPrompt,
    userInput,
    schema,
    schemaName,
  }: StructuredOutputRequest<T>): Promise<T | null> {
    const result = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "developer", content: systemPrompt },
        { role: "user", content: JSON.stringify(userInput, null, 2) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema: toGroqJsonSchema(schema),
        },
      },
      max_completion_tokens: this.maxCompletionTokens,
      reasoning_effort: "low",
    });

    const content = result.choices[0]?.message.content;
    if (!content) return null;

    const parsedJson: unknown = JSON.parse(content);
    const parsedOutput = schema.safeParse(parsedJson);
    return parsedOutput.success ? parsedOutput.data : null;
  }
}

/** ZodのJSON SchemaからGroq APIで不要なスキーマ宣言を除外する。 */
function toGroqJsonSchema(schema: z.ZodType) {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(schema)).filter(([key]) => key !== "$schema"),
  );
}
