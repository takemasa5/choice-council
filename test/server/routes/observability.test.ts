import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../../../server/app";
import {
  getSafeApiRoute,
  type ApiLogger,
  type ApiRequestLogEvent,
  type LlmRequestFailureLogEvent,
} from "../../../server/observability/api-request-logger";
import { memo, requestJson } from "../../../test-support/server";

const facilitatorStartResponse = {
  current_phase: "premise",
  current_phase_label: "前提整理",
  phase_goal: "前提を整理する",
  facilitator_message: "相談内容を整理します。",
  expert_requests: [],
  user_question: {
    question: "最も重視する点はどれですか？",
    options: ["費用", "その他"],
    required: true,
  },
  memo_updates: memo,
  next_action: "wait_user",
} as const;

test("末尾スラッシュ付きの既知APIだけを正規routeとして記録する", () => {
  assert.equal(getSafeApiRoute("/api/health/"), "/api/health");
  assert.equal(getSafeApiRoute("/api/health/?token=secret"), "/api/unknown");
  assert.equal(getSafeApiRoute("/api/health/private/"), "/api/unknown");
});

test("LLM APIの成功時に開始・完了の安全な構造化ログを記録する", async () => {
  const events: Array<ApiRequestLogEvent | LlmRequestFailureLogEvent> = [];
  const response = await requestJson(
    createApp({
      logger: createCapturingLogger(events),
      createLlmProvider: () =>
        ({
          generateStructuredOutput: async () => facilitatorStartResponse,
        }) as never,
    }),
    "/api/facilitator/start",
    { consultation: "非公開の相談本文" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    events.map((event) => event.event),
    ["api_request_started", "api_request_completed"],
  );
  assert.deepEqual(events[0], {
    event: "api_request_started",
    method: "POST",
    route: "/api/facilitator/start",
  });
  assert.equal(events[1]?.status, 200);
  assert.equal(typeof events[1]?.durationMs, "number");
  assert.doesNotMatch(JSON.stringify(events), /非公開の相談本文/);
});

test("LLMの上流503失敗を安全な情報だけで記録する", async () => {
  const events: Array<ApiRequestLogEvent | LlmRequestFailureLogEvent> = [];
  const secretConsultation = "利用者の相談本文: 非公開の家計情報";
  const secretCredential = "Bearer secret-access-token";
  const upstreamError = Object.assign(
    new Error(`${secretConsultation}; ${secretCredential}`),
    { status: 503 },
  );
  const response = await requestJson(
    createApp({
      logger: createCapturingLogger(events),
      createLlmProvider: () =>
        ({
          generateStructuredOutput: async () => {
            throw upstreamError;
          },
        }) as never,
    }),
    "/api/facilitator/start",
    { consultation: secretConsultation },
  );

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: "llm_request_failed",
    message: "LLM API request failed.",
  });
  assert.doesNotMatch(JSON.stringify(response.body), /非公開の家計情報/);
  assert.doesNotMatch(JSON.stringify(response.body), /secret-access-token/);
  const failure = events.find(
    (event): event is LlmRequestFailureLogEvent =>
      event.event === "llm_request_failed",
  );
  assert.ok(failure);
  assert.deepEqual(failure, {
    event: "llm_request_failed",
    method: "POST",
    route: "/api/facilitator/start",
    status: 502,
    durationMs: failure.durationMs,
    errorType: "llm_provider_error",
    errorMessage: "LLM API request failed.",
    upstreamStatus: 503,
  });
  assert.equal(typeof failure.durationMs, "number");
  assert.doesNotMatch(JSON.stringify(events), /非公開の家計情報/);
  assert.doesNotMatch(JSON.stringify(events), /secret-access-token/);
});

/** テストで構造化ログを検証するための注入可能なロガー。 */
function createCapturingLogger(
  events: Array<ApiRequestLogEvent | LlmRequestFailureLogEvent>,
): ApiLogger {
  return {
    info: (event) => events.push(event),
    error: (event) => events.push(event),
  };
}
