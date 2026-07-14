import type { RequestHandler } from "express";
import { zodTextFormat } from "openai/helpers/zod";
import {
  SessionMemoRequestSchema,
  SessionMemoSchema,
  type SessionMemo,
} from "../../src/shared/schemas/session";
import {
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendMissingApiKey,
  sendOpenAIRequestFailed,
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

    const apiKey = dependencies.getApiKey();
    if (!apiKey) {
      sendMissingApiKey(response);
      return;
    }

    try {
      const client = dependencies.createOpenAIClient(apiKey);
      const output = await parseStructuredOutputOnceWithRetry<SessionMemo>(
        () =>
          client.responses.parse({
            model: dependencies.getModel(),
            input: [
              developerMessage(sessionMemoDeveloperPrompt),
              userMessage(parsedRequest.data),
            ],
            text: { format: zodTextFormat(SessionMemoSchema, "session_memo") },
          }) as unknown as Promise<{ output_parsed: SessionMemo | null }>,
      );

      if (!output) {
        sendInvalidModelResponse(response);
        return;
      }

      response.json(output);
    } catch (error) {
      sendOpenAIRequestFailed(response, error);
    }
  };
}

/** 日本語名: 開発者メッセージをResponses API形式へ変換する関数。 */
function developerMessage(text: string) {
  return {
    role: "developer" as const,
    content: [{ type: "input_text" as const, text }],
  };
}

/** 日本語名: ユーザー入力をResponses API形式へ変換する関数。 */
function userMessage(value: unknown) {
  return {
    role: "user" as const,
    content: [
      { type: "input_text" as const, text: JSON.stringify(value, null, 2) },
    ],
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
- 出力は指定 schema に厳密に従う。
`;
