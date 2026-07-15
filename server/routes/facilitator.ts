import type { RequestHandler } from "express";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import {
  ConsultationStartRequestSchema,
  FacilitatorResponseRequestSchema,
  FacilitatorResponseSchema,
  type FacilitatorResponse,
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
 * ファシリテーター初回応答を生成する API ハンドラを作成する。
 *
 * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/start` と
 * `docs/api/schemas.md#M2 route の追加検証`。
 */
export function createFacilitatorStartHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return createM2FacilitatorHandler(
    dependencies,
    ConsultationStartRequestSchema,
  );
}

/**
 * ファシリテーター確認回答を生成する API ハンドラを作成する。
 *
 * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/respond` と
 * `docs/api/schemas.md#M2 route の追加検証`。
 */
export function createFacilitatorRespondHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return createM2FacilitatorHandler(
    dependencies,
    FacilitatorResponseRequestSchema,
  );
}

/**
 * M2 のファシリテーター API で共通の入力検証と応答生成を行う。
 *
 * 仕様対応: `docs/api/schemas.md#M2 route の追加検証`。
 */
function createM2FacilitatorHandler(
  dependencies: AppDependencies,
  requestSchema: z.ZodType,
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = requestSchema.safeParse(request.body);

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
      const output =
        await parseStructuredOutputOnceWithRetry<FacilitatorResponse>(
          () =>
            client.responses.parse({
              model: dependencies.getModel(),
              input: [
                developerMessage(facilitatorDeveloperPrompt),
                userMessage(parsedRequest.data),
              ],
              text: {
                format: zodTextFormat(
                  FacilitatorResponseSchema,
                  "facilitator_response",
                ),
              },
            }) as unknown as Promise<{
              output_parsed: FacilitatorResponse | null;
            }>,
          (modelResponse) => isAcceptedM2FacilitatorResponse(modelResponse),
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
 * モデル応答が M2 の前提整理専用制約を満たすか判定する。
 *
 * 仕様対応: `docs/api/schemas.md#M2 route の追加検証`。
 */
function isAcceptedM2FacilitatorResponse(modelResponse: FacilitatorResponse) {
  const parsedResponse = FacilitatorResponseSchema.safeParse(modelResponse);
  if (!parsedResponse.success) return false;

  const response = parsedResponse.data;
  if (response.current_phase !== "premise") return false;

  if (response.user_question) {
    return (
      response.user_question.required && response.next_action === "wait_user"
    );
  }

  return (
    response.next_action === "request_experts" &&
    response.expert_requests.length > 0
  );
}

/**
 * ファシリテーターへ渡す開発者プロンプト。
 *
 * 日本語名: ファシリテーター開発者プロンプト。
 * 仕様対応: `docs/prompts/facilitator.md`。
 */
const facilitatorDeveloperPrompt = `
あなたは Choice Council のファシリテーターです。
目的は、ユーザーの意思決定を代行することではなく、相談前よりも意思決定が前に進んだ状態を作ることです。

守ること:
- 日本語で自然に進行する。
- 断定的な結論を急がない。
- 医療、法律、投資、生命安全、虐待、DVなどの高リスク領域では、判断材料の整理と相談準備に目的を切り替える。
- 外部調査は実施できない。必要な場合は未確認事項として残す。
- 初回応答では相談内容を要約し、事実、希望、不安、不明点を整理する。
- 初回応答で外部調査が必要な内容は断定せず、memo_updates.open_questions に未確認事項として残す。
- 初回応答と確認回答では、情報不足が大きい場合のみ確認質問を1問返す。
- 初回応答では次に必要な専門家ロール候補を expert_requests に含める。専門家が重視する観点は viewpoint に明示する。
- 高リスク領域では専門家ロール候補や次アクションを、判断材料の整理と相談準備に向ける。
- currentPhase、userQuestion、userQuestionAnswer、memo が入力に含まれる場合は、その質問への回答とメモを前提整理へ反映し、初回の前提整理からやり直さない。
- 出力の current_phase は必ず premise にする。
- userQuestion と userQuestionAnswer が入力に含まれる場合は、その質問へのユーザー回答として扱い、memo_updates と次アクションに反映する。
- user_question を返す場合、options は2件以上にし、必ず「その他」を含める。
- 出力は指定 schema に厳密に従う。
`;
