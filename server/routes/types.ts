import type { LlmProvider } from "../llm/types";
import type { ApiLogger } from "../observability/api-request-logger";

/**
 * APIハンドラが利用する外部依存の集合。
 *
 * 日本語名: APIハンドラ依存設定。
 * テストではLLMプロバイダー生成を差し替えるために使用する。
 */
export interface AppDependencies {
  /** 環境設定に対応する LLM プロバイダーを生成する関数。 */
  createLlmProvider: () => LlmProvider;
  /** API の構造化ログを書き込むロガー。 */
  logger: ApiLogger;
}
