import type { RequestHandler } from "express";
import {
  ExpertCommentRequestSchema,
  ExpertCommentSchema,
  type ExpertComment,
} from "../../src/shared/schemas/session";
import {
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendLlmRequestFailed,
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

    try {
      const provider = dependencies.createLlmProvider();
      const output = await parseStructuredOutputOnceWithRetry<ExpertComment>(
        () =>
          provider.generateStructuredOutput({
            systemPrompt: expertDeveloperPrompt,
            userInput: parsedRequest.data,
            schema: ExpertCommentSchema,
            schemaName: "expert_comment",
          }),
      );

      if (!output) {
        sendInvalidModelResponse(request, response);
        return;
      }

      response.json({
        ...output,
        role_name: parsedRequest.data.expert.role_name,
        viewpoint: parsedRequest.data.expert.viewpoint,
      });
    } catch (error) {
      sendLlmRequestFailed(request, response, error);
    }
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
- 初回コメントでは proposal に具体的な案を1つだけ入れる。proposal.id はこのコメント内で一意な短い識別子にし、name、content、benefits、sacrifices、conditions はすべて具体的に埋める。
- proposal は一般論ではなく、相談に対して実行可否を検討できる案にする。利点だけでなく、何を犠牲にするかと、成立に必要な条件を明示する。
- 最重要ポイントを key_point に1つだけ示す。
- 気になるリスクや不明点を concern に示す。ない場合も「現時点では特になし」と明示する。
- 必要な場合のみ question_to_user にユーザーへの質問を1つ出す。不要な場合は「なし」とする。
- 外部調査が必要な内容は断定せず、needs_research を true にする。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、断定的助言ではなく判断材料の整理と相談準備に限定する。
- 出力は指定 schema に厳密に従う。
`;
