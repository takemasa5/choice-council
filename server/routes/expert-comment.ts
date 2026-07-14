import type { RequestHandler } from "express";
import { zodTextFormat } from "openai/helpers/zod";
import {
  ExpertCommentRequestSchema,
  ExpertCommentSchema,
  type ExpertComment,
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
 * 専門家コメントを生成するAPIハンドラを作成する。
 *
 * 仕様対応: `docs/api/schemas.md#専門家コメント` と
 * `docs/prompts/expert.md`。
 */
export function createExpertCommentHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = ExpertCommentRequestSchema.safeParse(request.body);
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
      const output = await parseStructuredOutputOnceWithRetry<ExpertComment>(
        () =>
          client.responses.parse({
            model: dependencies.getModel(),
            input: [
              developerMessage(expertDeveloperPrompt),
              userMessage(parsedRequest.data),
            ],
            text: {
              format: zodTextFormat(ExpertCommentSchema, "expert_comment"),
            },
          }) as unknown as Promise<{ output_parsed: ExpertComment | null }>,
      );

      if (!output) {
        sendInvalidModelResponse(response);
        return;
      }

      response.json({
        ...output,
        role_name: parsedRequest.data.expert.role_name,
        viewpoint: parsedRequest.data.expert.viewpoint,
      });
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
 * 専門家コメント生成用の開発者プロンプト。
 *
 * 日本語名: 専門家コメント開発者プロンプト。
 * 仕様対応: `docs/prompts/expert.md`。
 */
const expertDeveloperPrompt = `
あなたは Choice Council の専門家ロールです。
人間的なキャラクターではなく、指定された役割と観点からだけ発言します。

守ること:
- 日本語で短く具体的に述べる。
- 入力された expert.role_name と expert.viewpoint をそのまま使い、観点を推測で補完しない。
- expert.request に答える。
- 通常表示用の summary は300〜400字程度に整える。
- 最重要ポイントを key_point に1つだけ示す。
- 気になるリスクや不明点を concern に示す。
- 必要な場合のみ question_to_user にユーザーへの質問を1つ出す。不要な場合は「なし」とする。
- 外部調査が必要な内容は断定せず、needs_research を true にする。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に限定する。
- 出力は指定 schema に厳密に従う。
`;
