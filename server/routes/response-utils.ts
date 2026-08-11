import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  InvalidLlmConfigurationError,
  MissingLlmApiKeyError,
  UnsupportedLlmProviderError,
} from "../llm/types";
import {
  getElapsedDurationMs,
  getRequestObservabilityContext,
  getSafeApiRoute,
} from "../observability/api-request-logger";

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
        : error.provider === "gemini"
          ? "GEMINI_API_KEY が設定されていません。"
          : "GROQ_API_KEY が設定されていません。",
  });
}

/** 日本語名: LLM構造化出力不正レスポンスを返す関数。 */
export function sendInvalidModelResponse(request: Request, response: Response) {
  logLlmRequestFailure(request, response, 502, {
    errorType: "invalid_model_response",
    errorMessage: invalidModelResponseMessage,
  });
  response.status(502).json({
    error: "invalid_model_response",
    message: invalidModelResponseMessage,
  });
}

/** 日本語名: LLM設定または外部API呼び出しの失敗レスポンスを返す関数。 */
export function sendLlmRequestFailed(
  request: Request,
  response: Response,
  error: unknown,
) {
  if (error instanceof MissingLlmApiKeyError) {
    logLlmRequestFailure(request, response, 500, getSafeLlmErrorDetails(error));
    sendMissingLlmApiKey(response, error);
    return;
  }

  if (error instanceof InvalidLlmConfigurationError) {
    logLlmRequestFailure(request, response, 500, getSafeLlmErrorDetails(error));
    response.status(500).json({
      error: "invalid_llm_configuration",
      message:
        "GROQ_MAX_OUTPUT_TOKENS には 1 以上 65536 以下の整数を指定してください。",
    });
    return;
  }

  if (error instanceof UnsupportedLlmProviderError) {
    logLlmRequestFailure(request, response, 500, getSafeLlmErrorDetails(error));
    response.status(500).json({
      error: "unsupported_llm_provider",
      message:
        "LLM_PROVIDER には openai、gemini、または groq を指定してください。",
    });
    return;
  }

  logLlmRequestFailure(request, response, 502, getSafeLlmErrorDetails(error));
  response.status(502).json({
    error: "llm_request_failed",
    message: "LLM API request failed.",
  });
}

/** LLM 失敗時に、入力本文を含めない構造化イベントを共通で記録する。 */
function logLlmRequestFailure(
  request: Request,
  response: Response,
  status: number,
  errorDetails: {
    errorType: string;
    errorMessage: string;
    upstreamStatus?: number;
  },
) {
  const context = getRequestObservabilityContext(response);
  if (!context) return;

  context.logger.error({
    event: "llm_request_failed",
    method: request.method,
    route: getSafeApiRoute(request.path),
    status,
    durationMs: getElapsedDurationMs(context.startedAt),
    ...errorDetails,
  });
}

/** エラー本文を記録せず、運用に必要な分類だけを安全な値へ変換する。 */
function getSafeLlmErrorDetails(error: unknown) {
  if (error instanceof MissingLlmApiKeyError) {
    return {
      errorType: "missing_llm_api_key",
      errorMessage: "LLM API key is not configured.",
    };
  }

  if (error instanceof InvalidLlmConfigurationError) {
    return {
      errorType: "invalid_llm_configuration",
      errorMessage: "LLM configuration is invalid.",
    };
  }

  if (error instanceof UnsupportedLlmProviderError) {
    return {
      errorType: "unsupported_llm_provider",
      errorMessage: "Unsupported LLM provider.",
    };
  }

  return {
    errorType: "llm_provider_error",
    errorMessage: "LLM API request failed.",
    ...getUpstreamStatus(error),
  };
}

/** SDK エラーから取得できる場合だけ、上流 HTTP ステータスを取り出す。 */
function getUpstreamStatus(error: unknown) {
  if (!isRecord(error)) return {};

  const status = error.status ?? error.statusCode;
  if (isHttpStatus(status)) return { upstreamStatus: status };

  const response = error.response;
  if (isRecord(response) && isHttpStatus(response.status)) {
    return { upstreamStatus: response.status };
  }

  return {};
}

/** HTTP ステータスとして扱える数値か判定する。 */
function isHttpStatus(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
  );
}

/** unknown を安全にプロパティ参照できるレコードか判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
