import assert from "node:assert/strict";
import test from "node:test";
import { FacilitatorRespondResponseSchema } from "../../../src/shared/schemas/session";
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

const initialQuestionResponse = {
  current_phase: "premise",
  current_phase_label: "前提整理",
  phase_goal: "前提を整理する",
  facilitator_message: "相談内容を確認します。",
  expert_requests: [],
  user_question: {
    question: "最も重視する点はどれですか？",
    options: ["費用", "その他"],
    required: true,
  },
  memo_updates: memo,
  next_action: "wait_user",
} as const;

test("POST /api/facilitator/start は必須確認質問を返す", async () => {
  const response = await requestJson(
    createTestApp(initialQuestionResponse),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, initialQuestionResponse);
});

test("POST /api/facilitator/start は確認質問なしの応答を拒否する", async () => {
  const response = await requestJson(
    createTestApp(expertResponse),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: "invalid_model_response",
    message: "この発言の生成に失敗しました。再生成できます。",
  });
});

test("POST /api/facilitator/respond は追加の確認質問を拒否する", async () => {
  const response = await requestJson(
    createTestApp(initialQuestionResponse),
    "/api/facilitator/respond",
    {
      consultation: "相談内容",
      currentPhase: "premise",
      userQuestion: initialQuestionResponse.user_question,
      userQuestionAnswer: "費用",
      memo,
    },
  );
  assert.equal(response.status, 502);
});

test("POST /api/facilitator/respond は追加質問を禁止する専用schemaをLLMへ渡す", async () => {
  let structuredRequest: unknown;
  const response = await requestJson(
    createTestApp(expertResponse, "test-api-key", (request) => {
      structuredRequest = request;
    }),
    "/api/facilitator/respond",
    {
      consultation: "相談内容",
      currentPhase: "premise",
      userQuestion: initialQuestionResponse.user_question,
      userQuestionAnswer: "費用",
      memo,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    (structuredRequest as { schemaName: string }).schemaName,
    "facilitator_respond_response",
  );
  assert.equal(
    FacilitatorRespondResponseSchema.safeParse(expertResponse).success,
    true,
  );
  assert.equal(
    FacilitatorRespondResponseSchema.safeParse({
      ...expertResponse,
      user_question: initialQuestionResponse.user_question,
    }).success,
    false,
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
