import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

/** M2 で質問を返さず専門家候補へ進む有効な応答。 */
const expertResponse = {
  current_phase: "premise",
  current_phase_label: "前提整理",
  phase_goal: "前提を整理する",
  facilitator_message: "相談内容を整理します。",
  expert_requests: [
    {
      role_name: "専門家",
      viewpoint: "観点",
      request: "確認してください",
    },
  ],
  user_question: null,
  memo_updates: memo,
  next_action: "request_experts",
} as const;

/** M2 で必須の確認質問を返す有効な応答。 */
const questionResponse = {
  ...expertResponse,
  expert_requests: [],
  user_question: {
    question: "優先したい条件はどれですか？",
    options: ["費用", "通いやすさ", "その他"],
    required: true,
  },
  next_action: "wait_user",
} as const;

test("POST /api/facilitator/start は有効な M2 応答を返す", async () => {
  let prompt = "";
  const response = await requestJson(
    createTestApp(expertResponse, "test-api-key", (request) => {
      prompt = JSON.stringify(request);
    }),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );

  assert.equal(response.status, 200);
  assert.equal(
    (response.body as { current_phase: string }).current_phase,
    "premise",
  );
  assert.match(prompt, /初回の前提整理からやり直さない/);
});

test("POST /api/facilitator/respond は質問、回答、メモを文脈として前提整理を継続する", async () => {
  let prompt = "";
  const response = await requestJson(
    createTestApp(expertResponse, "test-api-key", (request) => {
      prompt = JSON.stringify(request);
    }),
    "/api/facilitator/respond",
    {
      consultation: "相談内容",
      currentPhase: "premise",
      userQuestion: questionResponse.user_question,
      userQuestionAnswer: "費用",
      memo,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    (response.body as { current_phase: string }).current_phase,
    "premise",
  );
  assert.match(prompt, /\\"userQuestionAnswer\\": \\"費用\\"/);
  assert.match(prompt, /\\"theme\\": \\"相談テーマ\\"/);
});

test("POST /api/facilitator/respond は必須質問以外の入力を拒否する", async () => {
  const response = await requestJson(
    createTestApp(expertResponse),
    "/api/facilitator/respond",
    {
      consultation: "相談内容",
      currentPhase: "premise",
      userQuestion: { ...questionResponse.user_question, required: false },
      userQuestionAnswer: "費用",
      memo,
    },
  );

  assert.equal(response.status, 400);
  assert.equal((response.body as { error: string }).error, "invalid_request");
});

test("M2 応答制約に違反したモデル出力は一度だけ再試行し失敗を返す", async () => {
  let requests = 0;
  const response = await requestJson(
    createTestApp(
      [
        { ...expertResponse, facilitator_message: "" },
        { ...expertResponse, next_action: "move_phase" },
      ],
      "test-api-key",
      () => {
        requests += 1;
      },
    ),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );

  assert.equal(response.status, 502);
  assert.equal(requests, 2);
  assert.deepEqual(response.body, {
    error: "invalid_model_response",
    message: "この発言の生成に失敗しました。再生成できます。",
  });
});
