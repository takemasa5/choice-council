import type { RequestHandler } from "express";
import {
  FacilitatorTurnSchema,
  GroupChatNextRequestSchema,
  GroupChatStartRequestSchema,
  type FacilitatorTurn,
} from "../../src/shared/schemas/session";
import {
  parseStructuredOutputOnceWithRetry,
  sendInvalidModelResponse,
  sendInvalidRequest,
  sendLlmRequestFailed,
} from "./response-utils";
import type { AppDependencies } from "./types";

/** グループチャット開始ターンを生成するAPIハンドラを作成する。仕様対応: `docs/api/schemas.md#POST /api/facilitator/group-chat/start`。 */
export function createGroupChatStartHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return createGroupChatHandler(dependencies, GroupChatStartRequestSchema);
}

/** 次のグループチャット進行ターンを生成するAPIハンドラを作成する。仕様対応: `docs/api/schemas.md#POST /api/facilitator/group-chat/next`。 */
export function createGroupChatNextHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return createGroupChatHandler(dependencies, GroupChatNextRequestSchema);
}

/** グループチャット用ファシリテーターAPIの共通処理。仕様対応: `docs/api/schemas.md#グループチャット`。 */
function createGroupChatHandler(
  dependencies: AppDependencies,
  requestSchema: {
    safeParse: (value: unknown) => {
      success: boolean;
      data?: unknown;
      error?: { flatten: () => unknown };
    };
  },
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = requestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendInvalidRequest(response, parsedRequest.error?.flatten());
      return;
    }
    try {
      const output = await parseStructuredOutputOnceWithRetry<FacilitatorTurn>(
        () =>
          dependencies.createLlmProvider().generateStructuredOutput({
            systemPrompt: groupChatFacilitatorPrompt,
            userInput: parsedRequest.data,
            schema: FacilitatorTurnSchema,
            schemaName: "facilitator_turn",
          }),
        (turn) =>
          isAcceptedGroupChatTurn(
            turn,
            parsedRequest.data as { expertRepliesSinceUser?: number },
          ),
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

/** 専門家の連続発言上限を含め、進行ターンを受け入れ可能か判定する。 */
function isAcceptedGroupChatTurn(
  turn: FacilitatorTurn,
  request: { expertRepliesSinceUser?: number },
) {
  if (!FacilitatorTurnSchema.safeParse(turn).success) return false;
  return !(
    request.expertRepliesSinceUser === 2 &&
    turn.requestedSpeaker.speakerType === "expert"
  );
}

/** グループチャット進行用プロンプト。仕様対応: `docs/tasks/milestone-4.md#会話制御`。 */
const groupChatFacilitatorPrompt =
  "あなたはChoice Councilのファシリテーターです。指定schemaに従い、専門家またはユーザーを1人だけ指名してください。";
