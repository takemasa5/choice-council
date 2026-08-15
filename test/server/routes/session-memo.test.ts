import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../../../server/app";
import {
  StructuredOutputValidationError,
  type StructuredOutputRequest,
} from "../../../server/llm/types";
import { SessionMemoSchema } from "../../../src/shared/schemas/session";
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

test("セッションメモは文字数、配列数、Markdown構文を制限し通常文を許可する", () => {
  const validMemo = {
    ...memo,
    theme: "通常の相談テーマ",
    facts: [
      "費用 > 予算でも、# は見出しではなく、* と ~~ は記号です。",
      "通常のURLは https://example.com です。",
    ],
  };

  assert.ok(SessionMemoSchema.safeParse(validMemo).success);

  for (const [plainText, normalizedText] of [
    ["<em>強調</em>", "＜em＞強調＜/em＞"],
    ["<https://example.com>", "＜https://example.com＞"],
    ["<user@example.com>", "＜user@example.com＞"],
    ["<!-- note -->", "＜!-- note --＞"],
    ["A<B>C", "A＜B＞C"],
    ["> 注意点", "＞ 注意点"],
    ["  > 空白付き引用", "＞ 空白付き引用"],
  ]) {
    const parsedMemo = SessionMemoSchema.safeParse({
      ...memo,
      facts: [plainText],
    });

    assert.ok(parsedMemo.success);
    assert.equal(parsedMemo.data.facts[0], normalizedText);
  }

  for (const invalidMemo of [
    { ...memo, theme: "あ".repeat(121) },
    { ...memo, facts: ["1", "2", "3", "4"] },
    { ...memo, facts: ["あ".repeat(81)] },
    { ...memo, facts: ["1行目\n2行目"] },
    { ...memo, facts: ["# 見出し"] },
    { ...memo, facts: ["- 箇条書き"] },
    { ...memo, facts: ["1. 番号付きリスト"] },
    { ...memo, facts: ["```コードフェンス"] },
    { ...memo, facts: ["*単一強調*"] },
    { ...memo, facts: ["_単一強調_"] },
    { ...memo, facts: ["~~取り消し線~~"] },
    { ...memo, facts: ["[相対リンク](relative)"] },
    { ...memo, facts: ["![相対画像](images/example.png)"] },
  ]) {
    assert.equal(SessionMemoSchema.safeParse(invalidMemo).success, false);
  }
});

test("Markdown構文を含むセッションメモ応答は再生成する", async () => {
  let generationCount = 0;
  const outputs = [{ ...memo, facts: ["# 見出し"] }, memo];
  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const response = await requestJson(
    createApp({
      createLlmProvider: () => ({
        generateStructuredOutput: async <T>(
          request: StructuredOutputRequest<T>,
        ) => {
          const output = outputs[Math.min(generationCount, outputs.length - 1)];
          generationCount += 1;
          structuredRequests.push({
            repairInstruction: request.repairInstruction,
          });
          const parsedOutput = request.schema.safeParse(output);
          if (!parsedOutput.success) {
            throw new StructuredOutputValidationError({
              schemaName: request.schemaName,
              classification: "schema_validation",
              issues: parsedOutput.error.issues.map((issue) => ({
                path: issue.path.filter(
                  (segment): segment is string | number =>
                    typeof segment === "string" || typeof segment === "number",
                ),
                code: issue.code,
              })),
            });
          }
          return parsedOutput.data;
        },
      }),
    }),
    "/api/session-memo/update",
    { consultation: "相談内容", currentPhase: "deliberation" },
  );

  assert.equal(response.status, 200);
  assert.equal(generationCount, 2);
  assert.deepEqual(response.body, memo);
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /failure_classification=schema_validation/,
  );
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
