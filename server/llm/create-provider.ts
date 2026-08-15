import { GeminiLlmProvider } from "./gemini-provider";
import { GroqLlmProvider } from "./groq-provider";
import { OpenAiLlmProvider } from "./openai-provider";
import {
  InvalidLlmConfigurationError,
  MissingLlmApiKeyError,
  type LlmProvider,
  type LlmProviderName,
  UnsupportedLlmProviderError,
} from "./types";

const defaultGroqModel = "openai/gpt-oss-120b";

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

  if (provider === "groq") {
    return createGroqProvider(environment);
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

/** Groq 用のAPIキーとモデル名を検証してプロバイダーを生成する。 */
function createGroqProvider(environment: NodeJS.ProcessEnv): LlmProvider {
  const apiKey = environment.GROQ_API_KEY;
  if (!apiKey) throw new MissingLlmApiKeyError("groq");

  return new GroqLlmProvider(
    apiKey,
    getGroqModel(environment.GROQ_MODEL),
    undefined,
    getGroqMaxOutputTokens(environment.GROQ_MAX_OUTPUT_TOKENS),
  );
}

/** Groq でMVPの対象としているモデル名を取得する。 */
function getGroqModel(value: string | undefined): string {
  if (value === undefined) return defaultGroqModel;

  if (value !== defaultGroqModel) {
    throw new InvalidLlmConfigurationError("GROQ_MODEL");
  }

  return value;
}

/** Groq の最大出力トークン数を環境変数から取得する。 */
function getGroqMaxOutputTokens(value: string | undefined): number {
  if (value === undefined) return 1200;

  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidLlmConfigurationError("GROQ_MAX_OUTPUT_TOKENS");
  }

  const maxOutputTokens = Number(value);
  if (maxOutputTokens > 65536) {
    throw new InvalidLlmConfigurationError("GROQ_MAX_OUTPUT_TOKENS");
  }

  return maxOutputTokens;
}

/** 指定値が対応する LLM プロバイダー名か判定する。 */
export function isLlmProviderName(value: string): value is LlmProviderName {
  return value === "openai" || value === "gemini" || value === "groq";
}
