import type { RequestHandler } from "express";
import {
  FinalMarkdownRequestSchema,
  FinalMarkdownSchema,
  type FinalMarkdown,
  type FinalMemoStatus,
} from "../../src/shared/schemas/session";
import {
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendLlmRequestFailed,
} from "./response-utils";
import type { AppDependencies } from "./types";

/**
 * セッションの終了状態を画面表示用の日本語ラベルへ変換する対応表。
 *
 * 日本語名: 終了メモ状態ラベル。
 * 仕様対応: `docs/api/schemas.md#セッションメモ`。
 */
const finalMemoStatusLabels: Record<FinalMemoStatus, string> = {
  tentative_conclusion: "暫定結論",
  pending_decision: "判断保留",
  pending_research: "追加調査待ち",
  pending_family_discussion: "家族・関係者相談待ち",
  action_plan: "実行計画",
};

/**
 * 終了メモMarkdownを生成するAPIハンドラを作成する。
 *
 * 仕様対応: `docs/api/schemas.md#Markdown 終了メモ` と
 * `docs/prompts/final-markdown.md`。
 */
export function createFinalMarkdownHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = FinalMarkdownRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendInvalidRequest(response, parsedRequest.error.flatten());
      return;
    }

    try {
      const provider = dependencies.createLlmProvider();
      const expectedStatusLabel =
        finalMemoStatusLabels[parsedRequest.data.memo.status];
      const output = await parseStructuredOutputOnceWithRetry<FinalMarkdown>(
        () =>
          provider.generateStructuredOutput({
            systemPrompt: finalMarkdownDeveloperPrompt,
            userInput: parsedRequest.data,
            schema: FinalMarkdownSchema,
            schemaName: "final_markdown",
          }),
        (modelResponse) =>
          getMarkdownSection(
            modelResponse.markdown,
            "## 現時点の状態",
          ).includes(expectedStatusLabel),
      );

      if (!output) {
        sendInvalidModelResponse(response);
        return;
      }

      response.json(output);
    } catch (error) {
      sendLlmRequestFailed(response, error);
    }
  };
}

/**
 * Markdownから指定見出しの本文だけを取り出す。
 *
 * 仕様対応: `docs/design/memo-and-output.md#Markdown 終了メモ`。
 */
function getMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) return "";

  const sectionLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^#{1,2}\s/.test(line.trim())) break;
    sectionLines.push(line);
  }
  return sectionLines.join("\n");
}

/**
 * 終了メモ生成用の開発者プロンプト。
 *
 * 日本語名: 終了メモ開発者プロンプト。
 * 仕様対応: `docs/prompts/final-markdown.md`。
 */
const finalMarkdownDeveloperPrompt = `
あなたは Choice Council の終了メモ作成担当です。
ユーザーが後で見返せる意思決定メモを Markdown 形式で作成します。

守ること:
- 日本語で簡潔に整理する。
- 最終結論が出ていない場合も、memo.status に対応する現時点の状態を明示する。
- memo.status は次の表示ラベルとして「現時点の状態」に必ず含める。
  - tentative_conclusion: 暫定結論
  - pending_decision: 判断保留
  - pending_research: 追加調査待ち
  - pending_family_discussion: 家族・関係者相談待ち
  - action_plan: 実行計画
- 相談テーマ、現時点の状態、重視した価値観、未確認事項、次アクションを必ず含める。
- Markdown の見出しは次の構成と表記に完全一致させ、順番も守る。
  - # 意思決定メモ
  - ## 相談テーマ
  - ## 現時点の状態
  - ## 重視した価値観
  - ## 整理した事実
  - ## 検討した選択肢
  - ## 主な判断軸
  - ## 専門家コメント要約
  - ## 意見が割れた点
  - ## 未確認事項
  - ## 次アクション
  - ## セッションログ要約
- 専門家コメントは要点だけに整理する。
- 断定できないことを断定しない。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に留める。
- 出力は指定 schema に厳密に従う。
`;
