import {
  FacilitatorTurnSchema,
  type FacilitatorTurn,
  type GroupChatStartRequest,
} from "../shared/schemas/session";

/** 日本語名: 意見交換開始 API の失敗時に維持するクライアント状態。 */
export type GroupChatStartFailure = {
  kind: "failed";
  currentPhase: "deliberation";
  messages: [];
  errorMessage: string;
  retryRequest: GroupChatStartRequest;
};

/** 日本語名: 意見交換開始 API の成功時に処理する進行ターン。 */
export type GroupChatStartSuccess = {
  kind: "started";
  turn: FacilitatorTurn;
};

export type GroupChatStartResult =
  GroupChatStartFailure | GroupChatStartSuccess;

/**
 * 日本語名: 意見交換開始 API を実行し、失敗時は検討フェーズを維持する結果を返す。
 *
 * 仕様対応: `docs/design/user-experience.md#初回専門家コメントと意見交換`。
 */
export async function requestGroupChatStart(
  postJson: (path: string, request: GroupChatStartRequest) => Promise<unknown>,
  request: GroupChatStartRequest,
): Promise<GroupChatStartResult> {
  try {
    const body = await postJson("/api/facilitator/group-chat/start", request);
    const parsedTurn = FacilitatorTurnSchema.safeParse(body);
    if (parsedTurn.success) {
      return { kind: "started", turn: parsedTurn.data };
    }

    return createGroupChatStartFailure(
      request,
      "意見交換の開始に失敗しました。再試行してください。",
    );
  } catch (error) {
    return createGroupChatStartFailure(
      request,
      error instanceof Error ? error.message : "通信に失敗しました。",
    );
  }
}

/** 日本語名: API失敗時に画面が維持する状態を作成する。 */
function createGroupChatStartFailure(
  retryRequest: GroupChatStartRequest,
  errorMessage: string,
): GroupChatStartFailure {
  return {
    kind: "failed",
    currentPhase: "deliberation",
    messages: [],
    errorMessage,
    retryRequest,
  };
}
