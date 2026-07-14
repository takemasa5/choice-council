import assert from "node:assert/strict";
import test from "node:test";
import { createTestApp, memo, requestJson } from "../../../test-support/server";

test("POST /api/final-markdown/generate returns a final memo", async () => {
  const response = await requestJson(
    createTestApp({
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
要約`,
    }),
    "/api/final-markdown/generate",
    {
      consultation: "相談内容",
      memo: { ...memo, status: "tentative_conclusion" },
    },
  );

  assert.equal(response.status, 200);
  assert.match((response.body as { markdown: string }).markdown, /暫定結論/);
});
