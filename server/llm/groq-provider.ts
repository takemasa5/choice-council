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

/** ZodのJSON SchemaからGroq strict structured outputで未対応の制約を除外する。 */
function toGroqJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return removeUnsupportedGroqSchemaKeywords(z.toJSONSchema(schema)) as Record<
    string,
    unknown
  >;
}

/** Groqが受理しない制約だけを再帰的に除外し、JSON Schemaの構造は維持する。 */
function removeUnsupportedGroqSchemaKeywords(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUnsupportedGroqSchemaKeywords);
  }

  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          key !== "$schema" &&
          key !== "minLength" &&
          key !== "maxLength" &&
          key !== "minItems" &&
          key !== "maxItems",
      )
      .map(([key, child]) => [key, removeUnsupportedGroqSchemaKeywords(child)]),
  );
}

/** unknown を安全にプロパティ参照できるレコードか判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
