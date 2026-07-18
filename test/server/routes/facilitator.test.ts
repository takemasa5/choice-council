import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

const expertResponse = {
  current_phase: "premise",
  current_phase_label: "前提整理",
  phase_goal: "前提を整理する",
  facilitator_message: "相談内容を整理します。",
  expert_requests: [
    { role_name: "専門家", viewpoint: "観点", request: "確認してください" },
  ],
  user_question: null,
  memo_updates: memo,
  next_action: "request_experts",
} as const;

test("POST /api/facilitator/start は有効な前提整理を返す", async () => {
  const response = await requestJson(
    createTestApp(expertResponse),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );
  assert.equal(response.status, 200);
  assert.equal(
    (response.body as { current_phase: string }).current_phase,
    "premise",
  );
});

test("POST /api/facilitator/respond は不正な必須質問を拒否する", async () => {
  const response = await requestJson(
    createTestApp(expertResponse),
    "/api/facilitator/respond",
    {
      consultation: "相談内容",
      currentPhase: "premise",
      userQuestion: {
        question: "質問",
        options: ["A", "その他"],
        required: false,
      },
      userQuestionAnswer: "A",
      memo,
    },
  );
  assert.equal(response.status, 400);
});
