import OpenAI from "openai";
import { z } from "zod";
import {
  StructuredOutputValidationError,
  type LlmProvider,
  type StructuredOutputRequest,
} from "./types";

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
    repairInstruction,
  }: StructuredOutputRequest<T>): Promise<T | null> {
    const result = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "developer",
          content: repairInstruction
            ? `${systemPrompt}\n\n${repairInstruction}`
            : systemPrompt,
        },
        { role: "user", content: JSON.stringify(userInput, null, 2) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema: toGroqStrictTransportSchema(schema),
        },
      },
      max_completion_tokens: this.maxCompletionTokens,
      reasoning_effort: "low",
      temperature: 0.6,
    });

    const content = result.choices[0]?.message.content;
    const finishReason = result.choices[0]?.finish_reason;
    if (!content) {
      throw new StructuredOutputValidationError({
        schemaName,
        classification: "empty_content",
        finishReason,
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      throw new StructuredOutputValidationError({
        schemaName,
        classification: "invalid_json",
        finishReason,
      });
    }
    const parsedOutput = schema.safeParse(parsedJson);
    if (parsedOutput.success) return parsedOutput.data;

    throw new StructuredOutputValidationError({
      schemaName,
      classification: "schema_validation",
      finishReason,
      issues: parsedOutput.error.issues.map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        ),
        code: issue.code,
      })),
    });
  }
}

/** Zod schema をGroq strict structured output向けの送信用schemaへ変換する。 */
function toGroqStrictTransportSchema(
  schema: z.ZodType,
): Record<string, unknown> {
  return removeUnsupportedGroqTransportKeywords(
    z.toJSONSchema(schema),
  ) as Record<string, unknown>;
}

/** Groqが受理しない制約だけを再帰的に除外し、JSON Schemaの構造は維持する。 */
function removeUnsupportedGroqTransportKeywords(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUnsupportedGroqTransportKeywords);
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
      .map(([key, child]) => [
        key,
        removeUnsupportedGroqTransportKeywords(child),
      ]),
  );
}

/** unknown を安全にプロパティ参照できるレコードか判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
