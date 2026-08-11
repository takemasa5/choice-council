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
  logStructuredOutputFailure,
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
        (attempt) =>
          dependencies.createLlmProvider().generateStructuredOutput({
            systemPrompt,
            userInput: parsedRequest.data,
            schema: responseSchema,
            schemaName,
            repairInstruction: attempt?.repairInstruction,
          }),
        (turn) =>
          isAcceptedGroupChatTurn(
            turn,
            parsedRequest.data as {
              expertRepliesSinceUser?: number;
              confirmedExperts?: Array<{ participantId: string }>;
              recentMessages?: Array<{
                speakerType: "facilitator" | "expert" | "user";
                participantId: string;
              }>;
            },
          ),
        (failure) =>
          logStructuredOutputFailure(request, response, schemaName, failure),
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
    recentMessages?: Array<{
      speakerType: "facilitator" | "expert" | "user";
      participantId: string;
    }>;
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
  const lastParticipantMessage = [...(request.recentMessages ?? [])]
    .reverse()
    .find((message) => message.speakerType !== "facilitator");
  if (
    turn.requestedSpeaker.speakerType === "expert" &&
    request.confirmedExperts &&
    request.confirmedExperts.length > 1 &&
    lastParticipantMessage?.speakerType === "expert" &&
    lastParticipantMessage.participantId === turn.requestedSpeaker.participantId
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
- input.discussionSelection を必ず会話の起点にし、input.initialExpertComments 内の具体案を参照する。deep_dive なら選んだ案の根拠検証、compare なら2案のトレードオフ、defer なら全案を脱落させない比較軸の整理を始める。
- 初回専門家コメントの単純な再要約ではなく、選択に沿う議論の論点、指名理由、専門家への具体的な質問を示す。
- message、question、requestReason は、Markdown や改行を含まないプレーンテキストで各200字以内にする。
- 出力は指定 schema に厳密に従う。
`;

/** グループチャット進行用プロンプト。仕様対応: `docs/api/schemas.md#グループチャット`。 */
const groupChatNextFacilitatorPrompt = `
あなたは Choice Council のファシリテーターです。次に回答する参加者を1人だけ指名します。

守ること:
- 専門家を指名する場合、input.confirmedExperts にある専門家を選び、participantId を完全一致させる。
- ユーザーを指名する場合、userOptions は2件以上にし、「そのまま意見交換を続けて」を必ず含める。「その他」は含めない。
- 専門家を指名する場合、userOptions は null にする。
- input.expertRepliesSinceUser が2の場合、必ずユーザーを指名する。
- 直近の非ファシリテーター発言が専門家で、input.confirmedExperts が2人以上の場合、専門家を続けて指名するなら別の participantId を選ぶ。
- 専門家へは、直前の主張への賛成・留保・反論と、その理由または成立条件を答えられる具体的な質問をする。
- input.discussionContext.selection を必ず起点にし、input.discussionContext.proposals の participantId、roleName、案名、内容、利点、犠牲にする点、成立条件を具体的に参照する。deep_dive では提案者に根拠の擁護を、別の participantId の専門家に反論・代替・成立条件を具体化する質問をする。compare では選んだ2案のトレードオフを検討し、defer では全案を早期に脱落させず比較軸を整理する。
- message、question、requestReason は、Markdown や改行を含まないプレーンテキストで各200字以内にする。
- 出力は指定 schema に厳密に従う。
`;
