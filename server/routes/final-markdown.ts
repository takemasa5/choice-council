import type { RequestHandler } from "express";
import {
  FinalMarkdownRequestSchema,
  FinalMarkdownSchema,
  getFinalMarkdownHeading,
  type FinalMarkdown,
  type FinalMemoStatus,
} from "../../src/shared/schemas/session";
import {
  logStructuredOutputFailure,
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendLlmRequestFailed,
  type StructuredOutputPostValidator,
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
        (attempt) =>
          provider.generateStructuredOutput({
            systemPrompt: finalMarkdownDeveloperPrompt,
            userInput: parsedRequest.data,
            schema: FinalMarkdownSchema,
            schemaName: "final_markdown",
            repairInstruction: attempt?.repairInstruction,
          }),
        createFinalMarkdownValidator(expectedStatusLabel),
        (failure) =>
          logStructuredOutputFailure(
            request,
            response,
            "final_markdown",
            failure,
          ),
        { allowMarkdown: true },
      );

      if (!output) {
        sendInvalidModelResponse(request, response);
        return;
      }

      response.json(output);
    } catch (error) {
      sendLlmRequestFailed(request, response, error);
    }
  };
}

/** 選択済み終了状態の独立した記載不足を、本文を含まない再生成理由として返す。 */
function createFinalMarkdownValidator(
  expectedStatusLabel: string,
): StructuredOutputPostValidator<FinalMarkdown> {
  return (modelResponse) => {
    const statusSection = getMarkdownSection(
      modelResponse.markdown,
      "## 現時点の状態",
    );
    if (!hasStandaloneStatusLabel(statusSection, expectedStatusLabel)) {
      return {
        path: ["markdown"],
        code: "missing_standalone_status_label",
      };
    }

    if (
      hasStandaloneUnexpectedStatusLabel(statusSection, expectedStatusLabel)
    ) {
      return {
        path: ["markdown"],
        code: "unexpected_standalone_status_label",
      };
    }

    return true;
  };
}

/** 選択済み状態が、説明文ではなく単独の段落または箇条書き項目かを判定する。 */
function hasStandaloneStatusLabel(
  section: string,
  expectedStatusLabel: string,
) {
  const lines = section.split(/\r?\n/);

  return lines.some((line, index) => {
    const listItem = getUnorderedListItem(line);
    if (listItem !== null) return listItem === expectedStatusLabel;

    return (
      line.trim() === expectedStatusLabel &&
      isStandaloneParagraphLine(lines, index)
    );
  });
}

/** 選択されていない終了状態が、状態値として独立して併記されていないかを判定する。 */
function hasStandaloneUnexpectedStatusLabel(
  section: string,
  expectedStatusLabel: string,
) {
  return Object.values(finalMemoStatusLabels).some(
    (statusLabel) =>
      statusLabel !== expectedStatusLabel &&
      hasStandaloneStatusLabel(section, statusLabel),
  );
}

/** MarkdownDocument と同じく、順不同リストが段落を区切るものとして扱う。 */
function isStandaloneParagraphLine(lines: string[], index: number) {
  const previousLine = lines[index - 1];
  const nextLine = lines[index + 1];

  return (
    (previousLine === undefined ||
      previousLine.trim() === "" ||
      getUnorderedListItem(previousLine) !== null) &&
    (nextLine === undefined ||
      nextLine.trim() === "" ||
      getUnorderedListItem(nextLine) !== null)
  );
}

/** 許可済みの順不同リスト項目の表示テキストを取り出す。 */
function getUnorderedListItem(line: string): string | null {
  const match = line.match(/^ {0,3}(?:-|\*)[ \t]+(.+?)\s*$/);
  return match ? match[1] : null;
}

/**
 * Markdownから指定見出しの本文だけを取り出す。
 *
 * 仕様対応: `docs/design/memo-and-output.md#Markdown 終了メモ`。
 */
function getMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex(
    (line) => getFinalMarkdownHeading(line) === heading,
  );
  if (startIndex === -1) return "";

  const sectionLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (getFinalMarkdownHeading(line) !== null) break;
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
- contextSummary と recentMessages から、重要な論点の展開、ユーザーの意思表示、終了状態に至った経緯を「セッションログ要約」へ反映する。発言全文は列挙しない。
- 断定できないことを断定しない。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に留める。
- Markdown は見出し、段落、順不同リストだけを使う。コードブロック、番号付きリスト、HTML は使わない。全文を3000字以内にし、各セクションを簡潔にする。
- 出力は指定 schema に厳密に従う。
`;
