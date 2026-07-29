import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

test("POST /api/session-memo/update returns a validated session memo", async () => {
  const response = await requestJson(
    createTestApp(memo),
    "/api/session-memo/update",
    { consultation: "相談内容", currentPhase: "deliberation" },
  );

  assert.equal(response.status, 200);
  assert.equal((response.body as { theme: string }).theme, "相談テーマ");
});

test("POST /api/session-memo/update reports a missing API key", async () => {
  const response = await requestJson(
    createTestApp(null, ""),
    "/api/session-memo/update",
    { consultation: "相談内容", currentPhase: "deliberation" },
  );

  assert.equal(response.status, 500);
  assert.equal(
    (response.body as { error: string }).error,
    "missing_llm_api_key",
  );
});

test("POST /api/session-memo/update rejects a facilitator response with both a question and expert requests", async () => {
  const response = await requestJson(
    createTestApp(memo),
    "/api/session-memo/update",
    {
      consultation: "相談内容",
      currentPhase: "premise",
      facilitatorResponse: {
        current_phase: "premise",
        current_phase_label: "前提整理",
        phase_goal: "前提を整理する",
        facilitator_message: "確認が必要です。",
        expert_requests: [
          {
            role_name: "専門家",
            viewpoint: "観点",
            request: "確認してください",
          },
        ],
        user_question: {
          question: "優先したい条件はどれですか？",
          options: ["費用", "通いやすさ", "その他"],
          required: true,
        },
        memo_updates: memo,
        next_action: "wait_user",
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal((response.body as { error: string }).error, "invalid_request");
});
