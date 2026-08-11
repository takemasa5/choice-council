import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../../../server/app";
import {
  StructuredOutputValidationError,
  type StructuredOutputRequest,
} from "../../../server/llm/types";
import { FinalMarkdownSchema } from "../../../src/shared/schemas/session";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

const validMarkdown = `# 意思決定メモ

## 相談テーマ
相談内容

## 現時点の状態
暫定結論

## 重視した価値観
価値観

## 整理した事実
事実

## 検討した選択肢
選択肢

## 主な判断軸
判断軸

## 専門家コメント要約
要約

## 意見が割れた点
なし

## 未確認事項
なし

## 次アクション
次の行動

## セッションログ要約
ユーザーは費用の上限を重視し、追加調査待ちを選択した。`;

test("POST /api/final-markdown/generate は会話文脈を終了メモ生成へ渡す", async () => {
  let generatedRequest: unknown;
  const response = await requestJson(
    createTestApp(
      {
        markdown: validMarkdown,
      },
      "test-api-key",
      (request) => {
        generatedRequest = request;
      },
    ),
    "/api/final-markdown/generate",
    {
      consultation: "相談内容",
      memo: { ...memo, status: "tentative_conclusion" },
      contextSummary: "費用の上限を確認している。",
      recentMessages: [
        {
          id: "message-1",
          speakerType: "user",
          speakerName: "あなた",
          participantId: "user",
          content: "予算の上限を重視したいです。",
          createdAt: "2026-07-26T00:00:00.000Z",
        },
      ],
    },
  );

  assert.equal(response.status, 200);
  assert.match((response.body as { markdown: string }).markdown, /暫定結論/);
  assert.deepEqual(
    (generatedRequest as { userInput: { contextSummary: string } }).userInput
      .contextSummary,
    "費用の上限を確認している。",
  );
  assert.equal(
    (generatedRequest as { userInput: { recentMessages: unknown[] } }).userInput
      .recentMessages.length,
    1,
  );
  assert.match(
    (generatedRequest as { systemPrompt: string }).systemPrompt,
    /contextSummary と recentMessages.*セッションログ要約/,
  );
});

test("POST /api/final-markdown/generate は上限を超える直近発言を拒否する", async () => {
  const recentMessages = Array.from({ length: 9 }, (_, index) => ({
    id: `message-${index + 1}`,
    speakerType: "user" as const,
    speakerName: "あなた",
    participantId: "user",
    content: `発言 ${index + 1}`,
    createdAt: "2026-07-26T00:00:00.000Z",
  }));
  const response = await requestJson(
    createTestApp({ markdown: "unused" }),
    "/api/final-markdown/generate",
    {
      consultation: "相談内容",
      memo: { ...memo, status: "tentative_conclusion" },
      contextSummary: "費用の上限を確認している。",
      recentMessages,
    },
  );

  assert.equal(response.status, 400);
});

test("終了メモ出力は許可したMarkdownブロックと3000字だけを受け付ける", () => {
  assert.ok(FinalMarkdownSchema.safeParse({ markdown: validMarkdown }).success);

  for (const markdown of [
    `${validMarkdown}\n\n### 許可しない見出し`,
    `${validMarkdown}\n\n1. 番号付きリスト`,
    `${validMarkdown}\n\n\`\`\`\nコード`,
    `${validMarkdown}\n\n<div>HTML</div>`,
    `${validMarkdown}\n\n> 引用`,
    `${validMarkdown}\n\n+ 許可しない箇条書き`,
    `${validMarkdown}\n\n${"あ".repeat(3001)}`,
  ]) {
    assert.equal(FinalMarkdownSchema.safeParse({ markdown }).success, false);
  }
});

test("POST /api/final-markdown/generate はMarkdown違反を理由付きで再生成する", async () => {
  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const outputs = [
    { markdown: `${validMarkdown}\n\n### 許可しない見出し` },
    { markdown: validMarkdown },
  ];
  const response = await requestJson(
    createApp({
      createLlmProvider: () =>
        ({
          generateStructuredOutput: async <T>(
            request: StructuredOutputRequest<T>,
          ) => {
            const output = outputs[structuredRequests.length] ?? outputs[1];
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
    "/api/final-markdown/generate",
    {
      consultation: "相談内容",
      memo: { ...memo, status: "tentative_conclusion" },
      contextSummary: "費用の上限を確認している。",
      recentMessages: [],
    },
  );

  assert.equal(response.status, 200);
  assert.equal(structuredRequests.length, 2);
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /failure_classification=schema_validation/,
  );
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /path=markdown,code=custom/,
  );
});

test("POST /api/final-markdown/generate は状態ラベル不足を理由付きで再生成する", async () => {
  const structuredRequests: Array<{ repairInstruction?: string }> = [];
  const invalidMarkdown = validMarkdown.replace("暫定結論", "判断保留");
  const response = await requestJson(
    createTestApp(
      [{ markdown: invalidMarkdown }, { markdown: validMarkdown }],
      "test-api-key",
      (request) => {
        structuredRequests.push(request as { repairInstruction?: string });
      },
    ),
    "/api/final-markdown/generate",
    {
      consultation: "相談内容",
      memo: { ...memo, status: "tentative_conclusion" },
      contextSummary: "費用の上限を確認している。",
      recentMessages: [],
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    structuredRequests[1]?.repairInstruction ?? "",
    /path=markdown,code=missing_expected_status_label/,
  );
});
