import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

test("POST /api/final-markdown/generate は会話文脈を終了メモ生成へ渡す", async () => {
  let generatedRequest: unknown;
  const response = await requestJson(
    createTestApp(
      {
        markdown: `# 意思決定メモ

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
ユーザーは費用の上限を重視し、追加調査待ちを選択した。`,
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
