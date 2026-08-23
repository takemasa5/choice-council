import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../../../server/app";
import {
  StructuredOutputValidationError,
  type StructuredOutputRequest,
} from "../../../server/llm/types";
import {
  ExpertRequestSchema,
  FacilitatorResponseRequestSchema,
  FacilitatorResponseSchema,
  FacilitatorRespondResponseSchema,
} from "../../../src/shared/schemas/session";
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
  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const response = await requestJson(
    createTestApp(expertResponse, "test-api-key", (request) => {
      structuredRequests.push(request as { repairInstruction?: string });
    }),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: "invalid_model_response",
    message: "この発言の生成に失敗しました。再生成できます。",
  });
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /path=user_question,code=missing_required_question/,
  );
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

test("ファシリテーター出力は通常画面用の文字数とMarkdownを制限する", () => {
  assert.ok(
    FacilitatorResponseSchema.safeParse(initialQuestionResponse).success,
  );
  assert.ok(
    FacilitatorResponseSchema.safeParse({
      ...initialQuestionResponse,
      facilitator_message: "通常文中の # は許可する。",
    }).success,
  );

  const outputWithExpertRequest = { ...expertResponse };
  for (const invalidOutput of [
    { ...initialQuestionResponse, current_phase_label: "あ".repeat(151) },
    { ...initialQuestionResponse, phase_goal: "1行目\n2行目" },
    { ...initialQuestionResponse, facilitator_message: "# 見出し" },
    {
      ...outputWithExpertRequest,
      expert_requests: [
        {
          ...outputWithExpertRequest.expert_requests[0],
          request: "あ".repeat(151),
        },
      ],
    },
    {
      ...initialQuestionResponse,
      user_question: {
        ...initialQuestionResponse.user_question,
        question: "あ".repeat(151),
      },
    },
    {
      ...initialQuestionResponse,
      user_question: {
        ...initialQuestionResponse.user_question,
        options: ["- 箇条書き", "その他"],
      },
    },
  ]) {
    assert.equal(
      FacilitatorResponseSchema.safeParse(invalidOutput).success,
      false,
    );
  }

  assert.ok(
    ExpertRequestSchema.safeParse({
      role_name: "# 入力用ロール",
      viewpoint: "あ".repeat(151),
      request: "入力に含まれる文面",
    }).success,
  );
  assert.ok(
    FacilitatorResponseRequestSchema.safeParse({
      consultation: "相談内容",
      currentPhase: "premise",
      userQuestion: {
        question: "あ".repeat(151),
        options: ["- 入力用の選択肢", "その他"],
        required: true,
      },
      userQuestionAnswer: "回答",
      memo,
    }).success,
  );
});

test("POST /api/facilitator/start はMarkdown違反のGroq出力を理由付きで再生成する", async () => {
  const structuredRequests: Array<{
    repairInstruction?: string;
  }> = [];
  const outputs = [
    { ...initialQuestionResponse, facilitator_message: "# Markdown見出し" },
    initialQuestionResponse,
  ];
  const response = await requestJson(
    createApp({
      createLlmProvider: () =>
        ({
          generateStructuredOutput: async <T>(
            request: StructuredOutputRequest<T>,
          ) => {
            const output =
              outputs[structuredRequests.length] ?? initialQuestionResponse;
            structuredRequests.push({
              repairInstruction: request.repairInstruction,
            });
            const parsedOutput = request.schema.safeParse(output);
            if (!parsedOutput.success) {
              throw new StructuredOutputValidationError({
                schemaName: request.schemaName,
                classification: "schema_validation",
                finishReason: "stop",
                issues: parsedOutput.error.issues.map((issue) => ({
                  path: issue.path.filter(
                    (segment): segment is string | number =>
                      typeof segment === "string" ||
                      typeof segment === "number",
                  ),
                  code: issue.code,
                })),
              });
            }
            return parsedOutput.data;
          },
        }) as never,
    }),
    "/api/facilitator/start",
    { consultation: "相談内容" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, initialQuestionResponse);
  assert.equal(structuredRequests.length, 2);
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /failure_classification=schema_validation/,
  );
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /path=facilitator_message,code=custom/,
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
