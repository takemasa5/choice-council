import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { LlmProvider, StructuredOutputRequest } from "./types";

/** OpenAI Responses API で構造化出力を生成するプロバイダー。 */
export class OpenAiLlmProvider implements LlmProvider {
  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly client = new OpenAI({ apiKey }),
  ) {}

  /** OpenAI の開発者メッセージとJSON化した入力から構造化出力を取得する。 */
  async generateStructuredOutput<T>({
    systemPrompt,
    userInput,
    schema,
    schemaName,
  }: StructuredOutputRequest<T>): Promise<T | null> {
    const result = await this.client.responses.parse({
      model: this.model,
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: JSON.stringify(userInput, null, 2) },
          ],
        },
      ],
      text: { format: zodTextFormat(schema, schemaName) },
    });

    return result.output_parsed;
  }
}
