import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  InvalidLlmConfigurationError,
  MissingLlmApiKeyError,
  StructuredOutputValidationError,
  type StructuredOutputFailureClassification,
  type StructuredOutputIssue,
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
  request: (attempt?: StructuredOutputAttempt) => Promise<T | null>,
  isValid: StructuredOutputPostValidator<T> = () => true,
  onFailure?: StructuredOutputFailureCallback,
) {
  let repairInstruction: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let result: T | null = null;
    let failure: Omit<
      StructuredOutputFailure,
      "attempt" | "terminationReason"
    > | null = null;

    try {
      result = await request({ attempt, repairInstruction });
    } catch (error) {
      failure = toStructuredOutputFailure(error);
      if (!failure) throw error;
    }

    if (!failure) {
      if (result === null) {
        failure = { classification: "empty_content", issues: [] };
      } else {
        const validationResult = isValid(result);
        if (validationResult !== true) {
          failure = toStructuredOutputFailure(
            new StructuredOutputValidationError({
              schemaName: "post_validation",
              classification: "post_validation",
              issues: validationResult === false ? [] : [validationResult],
            }),
          );
        }
      }
    }

    if (!failure) return result;

    const safeFailure: StructuredOutputFailure = {
      ...failure,
      attempt,
      terminationReason: attempt === 2 ? "max_attempts" : "retry",
    };
    onFailure?.(safeFailure);
    repairInstruction = createRepairInstruction(safeFailure);
  }

  return null;
}

/** 構造化出力の失敗を再生成・記録に使える安全な情報へ正規化する。 */
export interface StructuredOutputFailure {
  schemaName?: string;
  classification: StructuredOutputFailureClassification;
  finishReason?: string | null;
  issues: StructuredOutputIssue[];
  attempt: number;
  terminationReason: "retry" | "max_attempts";
}

/** 生成の再試行時に渡す安全な失敗通知。 */
export interface StructuredOutputAttempt {
  attempt: number;
  repairInstruction?: string;
}

/** 失敗本文・入力を受け取らない安全な失敗通知コールバック。 */
export type StructuredOutputFailureCallback = (
  failure: StructuredOutputFailure,
) => void;

/** 後続検証の失敗理由を、本文を含めずに再生成へ渡す。 */
export type StructuredOutputPostValidator<T> = (
  output: T,
) => boolean | StructuredOutputIssue;

/** 構造化出力の失敗を、本文を含まない運用ログとして記録する。 */
export function logStructuredOutputFailure(
  request: Request,
  response: Response,
  schemaName: string,
  failure: StructuredOutputFailure,
) {
  const context = getRequestObservabilityContext(response);
  if (!context) return;

  context.logger.error({
    event: "llm_structured_output_failed",
    route: getSafeApiRoute(request.path),
    schemaName,
    attempt: failure.attempt,
    classification: failure.classification,
    terminationReason: failure.terminationReason,
    finishReason: failure.finishReason,
    issues: failure.issues.map((issue) => ({
      path: issue.path,
      code: issue.code,
    })),
  });
}

/** 既知の検証エラーだけを、安全な失敗分類へ変換する。 */
function toStructuredOutputFailure(
  error: unknown,
): Omit<StructuredOutputFailure, "attempt" | "terminationReason"> | null {
  if (error instanceof StructuredOutputValidationError) {
    return {
      schemaName: error.schemaName,
      classification: error.classification,
      finishReason: error.finishReason,
      issues: error.issues,
    };
  }

  if (error instanceof SyntaxError) {
    return { classification: "invalid_json", issues: [] };
  }

  if (error instanceof ZodError) {
    return {
      classification: "schema_validation",
      issues: error.issues.map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        ),
        code: issue.code,
      })),
    };
  }

  return null;
}

/** 失敗分類とfield path/codeだけを渡してJSON再生成を求める。 */
function createRepairInstruction(failure: StructuredOutputFailure): string {
  const issues = failure.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "$";
      return `path=${path},code=${issue.code}`;
    })
    .join("; ");
  const details = issues
    ? ` failure_classification=${failure.classification}; ${issues}.`
    : ` failure_classification=${failure.classification}.`;

  return `指定schemaを満たすJSONだけを再生成してください。説明文やMarkdownは出力しないでください。${details}`;
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
