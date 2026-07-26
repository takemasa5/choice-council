import type { RequestHandler } from "express";
import type { z } from "zod";
import {
  FacilitatorTurnSchema,
  GroupChatNextRequestSchema,
  GroupChatStartRequestSchema,
  GroupChatStartTurnSchema,
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
  return createGroupChatHandler(
    dependencies,
    GroupChatStartRequestSchema,
    GroupChatStartTurnSchema,
    "group_chat_start_turn",
    groupChatStartFacilitatorPrompt,
  );
}

/** 次のグループチャット進行ターンを生成するAPIハンドラを作成する。仕様対応: `docs/api/schemas.md#POST /api/facilitator/group-chat/next`。 */
export function createGroupChatNextHandler(
  dependencies: AppDependencies,
): RequestHandler {
  return createGroupChatHandler(
    dependencies,
    GroupChatNextRequestSchema,
    FacilitatorTurnSchema,
    "facilitator_turn",
    groupChatNextFacilitatorPrompt,
  );
}

/** グループチャット用ファシリテーターAPIの共通処理。仕様対応: `docs/api/schemas.md#グループチャット`。 */
function createGroupChatHandler<Turn extends FacilitatorTurn>(
  dependencies: AppDependencies,
  requestSchema: {
    safeParse: (value: unknown) => {
      success: boolean;
      data?: unknown;
      error?: { flatten: () => unknown };
    };
  },
  responseSchema: z.ZodType<Turn>,
  schemaName: string,
  systemPrompt: string,
): RequestHandler {
  return async (request, response) => {
    const parsedRequest = requestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      sendInvalidRequest(response, parsedRequest.error?.flatten());
      return;
    }
    try {
      const output = await parseStructuredOutputOnceWithRetry<Turn>(
        () =>
          dependencies.createLlmProvider().generateStructuredOutput({
            systemPrompt,
            userInput: parsedRequest.data,
            schema: responseSchema,
            schemaName,
          }),
        (turn) =>
          isAcceptedGroupChatTurn(
            turn,
            parsedRequest.data as {
              expertRepliesSinceUser?: number;
              confirmedExperts?: Array<{ participantId: string }>;
            },
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

/** 専門家の連続発言上限を含め、進行ターンを受け入れ可能か判定する。 */
function isAcceptedGroupChatTurn(
  turn: FacilitatorTurn,
  request: {
    expertRepliesSinceUser?: number;
    confirmedExperts?: Array<{ participantId: string }>;
  },
) {
  if (!FacilitatorTurnSchema.safeParse(turn).success) return false;
  if (
    turn.requestedSpeaker.speakerType === "expert" &&
    !request.confirmedExperts?.some(
      (expert) => expert.participantId === turn.requestedSpeaker.participantId,
    )
  ) {
    return false;
  }
  return !(
    request.expertRepliesSinceUser === 2 &&
    turn.requestedSpeaker.speakerType === "expert"
  );
}

/** グループチャット開始用プロンプト。 */
const groupChatStartFacilitatorPrompt = `
あなたは Choice Council のファシリテーターです。初回専門家コメントを踏まえ、意見交換を開始します。

守ること:
- input.confirmedExperts にある専門家を1人だけ選び、requestedSpeaker に指定する。
- requestedSpeaker.participantId は、選んだ専門家の participantId と完全一致させる。
- requestedSpeaker.speakerType は expert、userOptions は null にする。
- 初回専門家コメントの単純な再要約ではなく、議論の論点、指名理由、専門家への具体的な質問を示す。
- 出力は指定 schema に厳密に従う。
`;

/** グループチャット進行用プロンプト。仕様対応: `docs/api/schemas.md#グループチャット`。 */
const groupChatNextFacilitatorPrompt = `
あなたは Choice Council のファシリテーターです。次に回答する参加者を1人だけ指名します。

守ること:
- 専門家を指名する場合、input.confirmedExperts にある専門家を選び、participantId を完全一致させる。
- ユーザーを指名する場合、userOptions に「その他」と「そのまま意見交換を続けて」を必ず含める。
- 専門家を指名する場合、userOptions は null にする。
- input.expertRepliesSinceUser が2の場合、必ずユーザーを指名する。
- 出力は指定 schema に厳密に従う。
`;
