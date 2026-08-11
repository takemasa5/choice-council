import type { RequestHandler } from "express";
import {
  SessionMemoRequestSchema,
  SessionMemoSchema,
  type SessionMemo,
} from "../../src/shared/schemas/session";
import {
  logStructuredOutputFailure,
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendLlmRequestFailed,
} from "./response-utils";
import type { AppDependencies } from "./types";

/**
 * セッションメモを更新するAPIハンドラを作成する。
 *
 * 仕様対応: `docs/api/schemas.md#セッションメモ` と
 * `docs/prompts/session-memo.md`。
 */
export function createSessionMemoHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = SessionMemoRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendInvalidRequest(response, parsedRequest.error.flatten());
      return;
    }

    try {
      const provider = dependencies.createLlmProvider();
      const output = await parseStructuredOutputOnceWithRetry<SessionMemo>(
        (attempt) =>
          provider.generateStructuredOutput({
            systemPrompt: sessionMemoDeveloperPrompt,
            userInput: parsedRequest.data,
            schema: SessionMemoSchema,
            schemaName: "session_memo",
            repairInstruction: attempt?.repairInstruction,
          }),
        () => true,
        (failure) =>
          logStructuredOutputFailure(
            request,
            response,
            "session_memo",
            failure,
          ),
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

/**
 * セッションメモ更新用の開発者プロンプト。
 *
 * 日本語名: セッションメモ開発者プロンプト。
 * 仕様対応: `docs/prompts/session-memo.md`。
 */
const sessionMemoDeveloperPrompt = `
あなたは Choice Council のセッションメモ更新担当です。
フェーズ区切り、または重要な整理が終わったタイミングで、これまでの文脈をセッションメモに反映します。

守ること:
- 日本語で簡潔に整理する。
- previousMemo がある場合は、丸ごと捨てずに新しい整理内容を反映した最新版にする。
- facilitatorResponse がある場合は、facilitator_message、user_question、memo_updates、next_action を現在の整理として扱う。
- expertComments がある場合は、専門家コメントの要約、要点、懸念を expert_summaries に反映する。
- needs_research が true の専門家懸念と、「なし」以外の question_to_user は open_questions に残す。
- userAction がある場合は、ユーザー操作として次アクションや未確認事項へ必要な範囲で反映する。
- 外部調査は実施できない。必要な情報は未確認事項として残す。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に留める。
- theme は Markdown や改行を含まないプレーンテキストで120字以内にする。facts、values、concerns、options、decision_axes、expert_summaries、conflicts、open_questions、next_actions は各最大3件とし、各要素を Markdown や改行を含まないプレーンテキストで80字以内にする。
- 出力は指定 schema に厳密に従う。
`;
