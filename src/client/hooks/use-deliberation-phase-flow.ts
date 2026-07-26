import { useState } from "react";
import type {
  ExpertComment,
  ExpertRequest,
  FacilitatorTurn,
  GroupChatStartRequest,
  SessionMemo,
} from "../../shared/schemas/session";
import { requestGroupChatStart } from "../group-chat-start";

/** 日本語名: 意見交換開始の通信、失敗保持、再試行を所有するフロー。 */
export function useDeliberationPhaseFlow({
  onReset,
  onStarted,
  onFinished,
}: {
  onReset: () => void;
  onStarted: (request: GroupChatStartRequest, turn: FacilitatorTurn) => void;
  onFinished: () => void;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [failedRequest, setFailedRequest] =
    useState<GroupChatStartRequest | null>(null);

  async function start({
    consultation,
    memo,
    confirmedExperts,
    expertComments,
  }: {
    consultation: string;
    memo: SessionMemo | null;
    confirmedExperts: ExpertRequest[];
    expertComments: ExpertComment[];
  }) {
    if (isStarting) return;
    const request = createGroupChatStartRequest({
      consultation,
      memo,
      confirmedExperts,
      expertComments,
    });
    if (!request) {
      setErrorMessage(
        "意見交換を始めるための専門家コメントを確認してください。",
      );
      return;
    }
    await sendStartRequest(request);
  }

  /** 日本語名: 失敗した意見交換開始リクエストを同じ内容で再送する。 */
  async function retry() {
    if (isStarting || !failedRequest) return;
    await sendStartRequest(failedRequest);
  }

  async function sendStartRequest(request: GroupChatStartRequest) {
    onReset();
    setIsStarting(true);
    setErrorMessage("");
    let waitsForInitialExpertReply = false;
    try {
      const result = await requestGroupChatStart(postStartRequest, request);
      if (result.kind === "failed") {
        setErrorMessage(result.errorMessage);
        setFailedRequest(result.retryRequest);
        return;
      }

      setFailedRequest(null);
      onStarted(request, result.turn);
      waitsForInitialExpertReply =
        result.turn.requestedSpeaker.speakerType === "expert";
    } finally {
      setIsStarting(false);
      if (!waitsForInitialExpertReply) onFinished();
    }
  }

  function clearFailure() {
    setErrorMessage("");
    setFailedRequest(null);
  }

  /** 日本語名: 意見交換開始APIへJSONを送信し、JSON応答を返す通信操作。 */
  async function postStartRequest(
    path: string,
    request: GroupChatStartRequest,
  ): Promise<unknown> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? body.message
          : undefined;
      throw new Error(
        typeof message === "string" ? message : "通信に失敗しました。",
      );
    }
    return body;
  }

  return {
    isStarting,
    errorMessage,
    failedRequest,
    start,
    retry,
    clearFailure,
  };
}

/** 日本語名: 意見交換開始に必要な確定済み入力を API 契約の形へ整える。 */
export function createGroupChatStartRequest({
  consultation,
  memo,
  confirmedExperts,
  expertComments,
}: {
  consultation: string;
  memo: SessionMemo | null;
  confirmedExperts: ExpertRequest[];
  expertComments: ExpertComment[];
}): GroupChatStartRequest | null {
  if (
    !memo ||
    confirmedExperts.length === 0 ||
    confirmedExperts.length !== expertComments.length
  ) {
    return null;
  }

  return {
    consultation,
    currentPhase: "group_chat",
    memo,
    confirmedExperts: confirmedExperts.map((expert, index) => ({
      ...expert,
      participantId: `expert-${index + 1}`,
    })),
    initialExpertComments: expertComments,
  };
}
