import type { RequestHandler } from "express";

/** API 呼び出しの開始・完了を表す安全なログイベント。 */
export interface ApiRequestLogEvent {
  event: "api_request_started" | "api_request_completed";
  method: string;
  route: string;
  status?: number;
  durationMs?: number;
}

/** LLM 呼び出しが失敗したときの安全なログイベント。 */
export interface LlmRequestFailureLogEvent {
  event: "llm_request_failed";
  method: string;
  route: string;
  status: number;
  durationMs: number;
  errorType: string;
  errorMessage: string;
  upstreamStatus?: number;
}

/** API の構造化ログを書き込むインターフェース。 */
export interface ApiLogger {
  info(event: ApiRequestLogEvent): void;
  error(event: LlmRequestFailureLogEvent): void;
}

/** リクエスト単位で共有する観測用の情報。 */
export interface RequestObservabilityContext {
  logger: ApiLogger;
  startedAt: number;
}

/** 本アプリが公開する API route。任意の URL をログへ流さないために使う。 */
const knownApiRoutes = new Set([
  "/api/health",
  "/api/facilitator/start",
  "/api/facilitator/respond",
  "/api/expert/comment",
  "/api/expert/group-chat",
  "/api/facilitator/group-chat/start",
  "/api/facilitator/group-chat/next",
  "/api/session-memo/update",
  "/api/final-markdown/generate",
]);

/** 運用時の既定ロガー。構造化イベントだけを標準出力・標準エラーへ出力する。 */
export const consoleApiLogger: ApiLogger = {
  info: (event) => console.info(JSON.stringify(event)),
  error: (event) => console.error(JSON.stringify(event)),
};

/** API リクエストの開始・完了を共通で記録するミドルウェアを作成する。 */
export function createApiRequestLogger(logger: ApiLogger): RequestHandler {
  return (request, response, next) => {
    const context: RequestObservabilityContext = {
      logger,
      startedAt: Date.now(),
    };
    setRequestObservabilityContext(response, context);

    logger.info({
      event: "api_request_started",
      method: request.method,
      route: getSafeApiRoute(request.path),
    });

    response.on("finish", () => {
      logger.info({
        event: "api_request_completed",
        method: request.method,
        route: getSafeApiRoute(request.path),
        status: response.statusCode,
        durationMs: getElapsedDurationMs(context.startedAt),
      });
    });

    next();
  };
}

/** レスポンスに保存された観測用コンテキストを取得する。 */
export function getRequestObservabilityContext(response: {
  locals: unknown;
}): RequestObservabilityContext | undefined {
  return (response.locals as { observability?: RequestObservabilityContext })
    .observability;
}

/** route として安全に記録できる固定値を返す。 */
export function getSafeApiRoute(path: string) {
  return knownApiRoutes.has(path) ? path : "/api/unknown";
}

/** 指定開始時刻からの経過時間をミリ秒で返す。 */
export function getElapsedDurationMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

/** レスポンスへ観測用コンテキストを保存する。 */
function setRequestObservabilityContext(
  response: { locals: unknown },
  context: RequestObservabilityContext,
) {
  (
    response.locals as { observability?: RequestObservabilityContext }
  ).observability = context;
}
