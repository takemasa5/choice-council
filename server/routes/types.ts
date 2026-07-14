import type OpenAI from "openai";

/**
 * APIハンドラが利用する外部依存の集合。
 *
 * 日本語名: APIハンドラ依存設定。
 * テストではOpenAIクライアントと環境変数取得を差し替えるために使用する。
 */
export interface AppDependencies {
  /** OpenAI APIクライアントを生成する関数。 */
  createOpenAIClient: (apiKey: string) => OpenAI;
  /** OpenAI APIキーを取得する関数。 */
  getApiKey: () => string | undefined;
  /** 使用するOpenAIモデル名を取得する関数。 */
  getModel: () => string;
}
