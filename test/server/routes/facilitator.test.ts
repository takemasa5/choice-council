import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

test("POST /api/facilitator/start validates input and returns a facilitator response", async () => {
  const response = await requestJson(
    createTestApp({
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
    }),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );

  assert.equal(response.status, 200);
  assert.equal(
    (response.body as { current_phase: string }).current_phase,
    "premise",
  );
});
