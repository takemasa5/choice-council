import type { z } from "zod";

/** LLM プロバイダーとして選択できる識別子。 */
export type LlmProviderName = "openai" | "gemini";

/** 構造化出力を生成する際にプロバイダーへ渡す共通入力。 */
export interface StructuredOutputRequest<T> {
  systemPrompt: string;
  userInput: unknown;
  schema: z.ZodType<T>;
  schemaName: string;
}

/** OpenAI と Gemini のSDK差異を隠蔽する構造化出力インターフェース。 */
export interface LlmProvider {
  generateStructuredOutput<T>(
    request: StructuredOutputRequest<T>,
  ): Promise<T | null>;
}

/** 必須の LLM API キーが未設定であることを表すエラー。 */
export class MissingLlmApiKeyError extends Error {
  constructor(readonly provider: LlmProviderName) {
    super(`${provider} API key is not configured.`);
    this.name = "MissingLlmApiKeyError";
  }
}

/** 未対応の LLM プロバイダー指定を表すエラー。 */
export class UnsupportedLlmProviderError extends Error {
  constructor(readonly provider: string) {
    super(`Unsupported LLM provider: ${provider}`);
    this.name = "UnsupportedLlmProviderError";
  }
}
