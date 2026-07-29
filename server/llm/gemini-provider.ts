import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { LlmProvider, StructuredOutputRequest } from "./types";

/** Gemini API で構造化出力を生成するプロバイダー。 */
export class GeminiLlmProvider implements LlmProvider {
  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly client = new GoogleGenAI({ apiKey }),
  ) {}

  /** Gemini の system instruction とJSON Schemaを使って構造化出力を取得する。 */
  async generateStructuredOutput<T>({
    systemPrompt,
    userInput,
    schema,
  }: StructuredOutputRequest<T>): Promise<T | null> {
    const responseJsonSchema = toGeminiJsonSchema(schema);
    const result = await this.client.models.generateContent({
      model: this.model,
      contents: JSON.stringify(userInput, null, 2),
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema,
      },
    });

    if (!result.text) return null;

    const parsedJson: unknown = JSON.parse(result.text);
    const parsedOutput = schema.safeParse(parsedJson);
    return parsedOutput.success ? parsedOutput.data : null;
  }
}

/** ZodのJSON SchemaからGemini APIで不要なスキーマ宣言を除外する。 */
function toGeminiJsonSchema(schema: z.ZodType) {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(schema)).filter(([key]) => key !== "$schema"),
  );
}
