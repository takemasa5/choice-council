import type { Response } from "express";
import { ZodError } from "zod";
import {
  MissingLlmApiKeyError,
  UnsupportedLlmProviderError,
} from "../llm/types";

/**
 * LLM構造化出力の最終失敗時にユーザーへ表示する文言。
 *
 * 仕様対応: `docs/api/schemas.md#バリデーション`。
 */
export const invalidModelResponseMessage =
  "この発言の生成に失敗しました。再生成できます。";

/**
 * LLMの構造化出力を最大1回再生成して取得する。
 *
 * 仕様対応: `docs/api/schemas.md#バリデーション` の再生成回数と
 * 不正な構造化出力の扱い。
 */
export async function parseStructuredOutputOnceWithRetry<T>(
  request: () => Promise<T | null>,
  isValid: (output: T) => boolean = () => true,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await request().catch((error: unknown) => {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return null;
      }

      throw error;
    });

    if (result && isValid(result)) {
      return result;
    }
  }

  return null;
}

/** 日本語名: 入力不正レスポンスを返す関数。 */
export function sendInvalidRequest(response: Response, details: unknown) {
  response.status(400).json({ error: "invalid_request", details });
}

/** 日本語名: LLM APIキー未設定レスポンスを返す関数。 */
export function sendMissingLlmApiKey(
  response: Response,
  error: MissingLlmApiKeyError,
) {
  response.status(500).json({
    error: "missing_llm_api_key",
    message:
      error.provider === "openai"
        ? "OPENAI_API_KEY が設定されていません。"
        : "GEMINI_API_KEY が設定されていません。",
  });
}

/** 日本語名: LLM構造化出力不正レスポンスを返す関数。 */
export function sendInvalidModelResponse(response: Response) {
  response.status(502).json({
    error: "invalid_model_response",
    message: invalidModelResponseMessage,
  });
}

/** 日本語名: LLM設定または外部API呼び出しの失敗レスポンスを返す関数。 */
export function sendLlmRequestFailed(response: Response, error: unknown) {
  if (error instanceof MissingLlmApiKeyError) {
    sendMissingLlmApiKey(response, error);
    return;
  }

  if (error instanceof UnsupportedLlmProviderError) {
    response.status(500).json({
      error: "unsupported_llm_provider",
      message: "LLM_PROVIDER には openai または gemini を指定してください。",
    });
    return;
  }

  response.status(502).json({
    error: "llm_request_failed",
    message: error instanceof Error ? error.message : "LLM API request failed.",
  });
}
