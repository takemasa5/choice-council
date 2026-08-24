import type { z } from "zod";

/** LLM プロバイダーとして選択できる識別子。 */
export type LlmProviderName = "openai" | "gemini" | "groq";

/** 構造化出力を生成する際にプロバイダーへ渡す共通入力。 */
export interface StructuredOutputRequest<T> {
  systemPrompt: string;
  userInput: unknown;
  schema: z.ZodType<T>;
  schemaName: string;
  repairInstruction?: string;
}

/** 構造化出力の検証失敗を分類する安全な識別子。 */
export type StructuredOutputFailureClassification =
  "empty_content" | "invalid_json" | "schema_validation" | "post_validation";

/** Zod検証失敗から安全に記録できる情報。 */
export interface StructuredOutputIssue {
  path: Array<string | number>;
  code: string;
}

/** 構造化出力の検証失敗を、安全な診断情報だけで伝えるエラー。 */
export class StructuredOutputValidationError extends Error {
  constructor({
    schemaName,
    classification,
    finishReason,
    issues = [],
  }: {
    schemaName: string;
    classification: StructuredOutputFailureClassification;
    finishReason?: string | null;
    issues?: StructuredOutputIssue[];
  }) {
    super("Structured output validation failed.");
    this.name = "StructuredOutputValidationError";
    this.schemaName = schemaName;
    this.classification = classification;
    this.finishReason = finishReason;
    this.issues = issues.map((issue) => ({
      path: issue.path.filter(
        (segment): segment is string | number =>
          typeof segment === "string" || typeof segment === "number",
      ),
      code: issue.code,
    }));
  }

  readonly schemaName: string;
  readonly classification: StructuredOutputFailureClassification;
  readonly finishReason: string | null | undefined;
  readonly issues: StructuredOutputIssue[];
}

/** OpenAI、Gemini、Groq のSDK差異を隠蔽する構造化出力インターフェース。 */
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

/** LLM の環境変数設定が不正であることを表すエラー。 */
export class InvalidLlmConfigurationError extends Error {
  constructor(readonly variableName: string) {
    super(`Invalid LLM configuration: ${variableName}`);
    this.name = "InvalidLlmConfigurationError";
  }
}

/** 未対応の LLM プロバイダー指定を表すエラー。 */
export class UnsupportedLlmProviderError extends Error {
  constructor(readonly provider: string) {
    super(`Unsupported LLM provider: ${provider}`);
    this.name = "UnsupportedLlmProviderError";
  }
}
