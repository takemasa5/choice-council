import { GeminiLlmProvider } from "./gemini-provider";
import { OpenAiLlmProvider } from "./openai-provider";
import {
  MissingLlmApiKeyError,
  type LlmProvider,
  type LlmProviderName,
  UnsupportedLlmProviderError,
} from "./types";

/** 環境変数からアプリ全体で使用する LLM プロバイダーを生成する。 */
export function createLlmProviderFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): LlmProvider {
  const provider = environment.LLM_PROVIDER ?? "openai";

  if (provider === "openai") {
    return createOpenAiProvider(environment);
  }

  if (provider === "gemini") {
    return createGeminiProvider(environment);
  }

  throw new UnsupportedLlmProviderError(provider);
}

/** OpenAI 用のAPIキーとモデル名を検証してプロバイダーを生成する。 */
function createOpenAiProvider(environment: NodeJS.ProcessEnv): LlmProvider {
  const apiKey = environment.OPENAI_API_KEY;
  if (!apiKey) throw new MissingLlmApiKeyError("openai");

  return new OpenAiLlmProvider(
    apiKey,
    environment.OPENAI_MODEL ?? "gpt-5-mini",
  );
}

/** Gemini 用のAPIキーとモデル名を検証してプロバイダーを生成する。 */
function createGeminiProvider(environment: NodeJS.ProcessEnv): LlmProvider {
  const apiKey = environment.GEMINI_API_KEY;
  if (!apiKey) throw new MissingLlmApiKeyError("gemini");

  return new GeminiLlmProvider(
    apiKey,
    environment.GEMINI_MODEL ?? "gemini-2.5-flash",
  );
}

/** 指定値が対応する LLM プロバイダー名か判定する。 */
export function isLlmProviderName(value: string): value is LlmProviderName {
  return value === "openai" || value === "gemini";
}
