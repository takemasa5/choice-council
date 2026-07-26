import { useReducer, useState } from "react";
import type {
  ExpertRequest,
  FacilitatorTurn,
  GroupChatMessage,
  GroupChatStartRequest,
  SessionMemo,
} from "../../shared/schemas/session";
import {
  FacilitatorTurnSchema,
  GroupChatMessageSchema,
} from "../../shared/schemas/session";
import { getRecentGroupChatMessages } from "../group-chat-context";
import {
  groupChatReducer,
  initialGroupChatState,
  type GroupChatState,
} from "../group-chat-state";

type ConfirmedGroupChatExpert = ExpertRequest & { participantId: string };

/**
 * 日本語名: 意見交換フェーズの状態、通信、ユーザー回答、専門家再生成を管理するHook。
 *
 * 仕様対応: `docs/design/client-ui-refactor-implementation-plan.md#グループチャットと終了フローの分離`。
 */
export function useGroupChatPhase({
  onInitialTurn,
  onTurnUpdated,
  shouldPause,
  onFinished,
}: {
  onInitialTurn: (turn: FacilitatorTurn) => void;
  onTurnUpdated: (turn: FacilitatorTurn) => void;
  shouldPause: () => boolean;
  onFinished: () => void;
}) {
  const [state, dispatch] = useReducer(groupChatReducer, initialGroupChatState);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  /** 日本語名: ファシリテーター発言を会話タイムライン用メッセージへ変換する。 */
  function createFacilitatorMessage(turn: FacilitatorTurn): GroupChatMessage {
    return {
      id: `facilitator-${Date.now()}`,
      speakerType: "facilitator",
      speakerName: "ファシリテーター",
      participantId: "facilitator",
      content: turn.message,
      createdAt: new Date().toISOString(),
    };
  }

  /** 日本語名: ユーザー回答を会話タイムライン用メッセージへ変換する。 */
  function createUserMessage(answer: string): GroupChatMessage {
    return {
      id: `user-${Date.now()}`,
      speakerType: "user",
      speakerName: "あなた",
      participantId: "user",
      content: answer.trim(),
      createdAt: new Date().toISOString(),
    };
  }

  /** 日本語名: グループチャット用APIへJSONを送信し、JSON応答を返す共通通信操作。 */
  async function postJson(path: string, request: unknown): Promise<unknown> {
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

  /** 日本語名: 意見交換開始で受け取った最初の進行ターンを反映する。 */
  function begin({
    request,
    turn,
  }: {
    request: GroupChatStartRequest;
    turn: FacilitatorTurn;
  }) {
    const message = createFacilitatorMessage(turn);
    const nextMemo = turn.memoUpdate ?? request.memo;
    const nextContextSummary = turn.contextSummaryUpdate ?? turn.message;

    setErrorMessage("");
    onInitialTurn(turn);
    dispatch({
      type: "set_turn",
      messages: [message],
      turn,
      contextSummary: nextContextSummary,
      expertRepliesSinceUser: 0,
    });
    if (turn.requestedSpeaker.speakerType === "expert") {
      void generateInitialExpertReply({
        consultation: request.consultation,
        turn,
        experts: request.confirmedExperts,
        messages: [message],
        memo: nextMemo,
        contextSummary: nextContextSummary,
      });
    }
  }

  /** 日本語名: 現在指名されている専門家の回答を再生成する。 */
  async function retryExpertReply({
    consultation,
    memo,
    confirmedExperts,
  }: {
    consultation: string;
    memo: SessionMemo | null;
    confirmedExperts: ExpertRequest[];
  }) {
    if (
      isLoading ||
      !state.turn ||
      state.turn.requestedSpeaker.speakerType !== "expert" ||
      !memo
    )
      return;

    setIsLoading(true);
    setErrorMessage("");
    try {
      await requestExpertReply({
        consultation,
        turn: state.turn,
        experts: addParticipantIds(confirmedExperts),
        messages: state.messages,
        expertRepliesSinceUser: state.expertRepliesSinceUser,
        memo,
        contextSummary: state.contextSummary || state.turn.message,
      });
    } catch (error) {
      setErrorMessage(getGroupChatErrorMessage(error));
    } finally {
      setIsLoading(false);
      onFinished();
    }
  }

  /** 日本語名: ユーザー回答を会話へ反映し、次の進行ターンを要求する。 */
  async function submitUserAnswer({
    answer,
    consultation,
    memo,
    confirmedExperts,
  }: {
    answer: string;
    consultation: string;
    memo: SessionMemo | null;
    confirmedExperts: ExpertRequest[];
  }) {
    if (isLoading || !state.turn || !memo || !answer.trim()) return;

    setIsLoading(true);
    setErrorMessage("");
    try {
      const message = createUserMessage(answer);
      await requestNextTurn({
        consultation,
        messages: [...state.messages, message],
        experts: addParticipantIds(confirmedExperts),
        expertRepliesSinceUser: 0,
        memo,
        contextSummary: state.turn.contextSummaryUpdate ?? state.contextSummary,
      });
      dispatch({ type: "set_other_answer", value: "" });
    } catch (error) {
      setErrorMessage(getGroupChatErrorMessage(error));
    } finally {
      setIsLoading(false);
      onFinished();
    }
  }

  /** 日本語名: 保存済みの意見交換状態を復元する。 */
  function restore(restoredState: Partial<GroupChatState>) {
    dispatch({ type: "restore", state: restoredState });
    setErrorMessage("");
  }

  /** 日本語名: 意見交換の会話・通信エラーを初期化する。 */
  function reset() {
    dispatch({ type: "reset" });
    setErrorMessage("");
  }

  /** 日本語名: ユーザーの自由入力を更新する。 */
  function changeOtherAnswer(value: string) {
    dispatch({ type: "set_other_answer", value });
  }

  async function generateInitialExpertReply({
    consultation,
    turn,
    experts,
    messages,
    memo,
    contextSummary,
  }: {
    consultation: string;
    turn: FacilitatorTurn;
    experts: ConfirmedGroupChatExpert[];
    messages: GroupChatMessage[];
    memo: SessionMemo;
    contextSummary: string;
  }) {
    setIsLoading(true);
    try {
      await requestExpertReply({
        consultation,
        turn,
        experts,
        messages,
        expertRepliesSinceUser: 0,
        memo,
        contextSummary,
      });
    } catch (error) {
      setErrorMessage(getGroupChatErrorMessage(error));
    } finally {
      setIsLoading(false);
      onFinished();
    }
  }

  /** 日本語名: 指名専門家の発言を生成し、次の進行ターンを要求する。 */
  async function requestExpertReply({
    consultation,
    turn,
    experts,
    messages,
    expertRepliesSinceUser,
    memo,
    contextSummary,
  }: {
    consultation: string;
    turn: FacilitatorTurn;
    experts: ConfirmedGroupChatExpert[];
    messages: GroupChatMessage[];
    expertRepliesSinceUser: number;
    memo: SessionMemo;
    contextSummary: string;
  }) {
    const expert = experts.find(
      (candidate) =>
        candidate.participantId === turn.requestedSpeaker.participantId,
    );
    if (!expert) throw new Error("指名された専門家を確認できませんでした。");

    const body = await postJson("/api/expert/group-chat", {
      consultation,
      currentPhase: "group_chat",
      memo,
      contextSummary,
      recentMessages: getRecentGroupChatMessages(messages),
      expert,
      facilitatorQuestion: turn.question,
    });
    const parsedMessage = GroupChatMessageSchema.safeParse(body);
    if (!parsedMessage.success) {
      throw new Error("専門家の回答生成に失敗しました。再試行してください。");
    }
    await requestNextTurn({
      consultation,
      messages: [...messages, parsedMessage.data],
      experts,
      expertRepliesSinceUser: expertRepliesSinceUser + 1,
      memo,
      contextSummary,
    });
  }

  /** 日本語名: 次の発言者を要求し、必要に応じて専門家の連続回答を進める。 */
  async function requestNextTurn({
    consultation,
    messages,
    experts,
    expertRepliesSinceUser,
    memo,
    contextSummary,
  }: {
    consultation: string;
    messages: GroupChatMessage[];
    experts: ConfirmedGroupChatExpert[];
    expertRepliesSinceUser: number;
    memo: SessionMemo;
    contextSummary: string;
  }) {
    const body = await postJson("/api/facilitator/group-chat/next", {
      consultation,
      currentPhase: "group_chat",
      memo,
      contextSummary,
      recentMessages: getRecentGroupChatMessages(messages),
      confirmedExperts: experts,
      expertRepliesSinceUser,
    });
    const parsedTurn = FacilitatorTurnSchema.safeParse(body);
    if (!parsedTurn.success) {
      throw new Error("次の意見交換の進行に失敗しました。再試行してください。");
    }
    const facilitatorMessage = createFacilitatorMessage(parsedTurn.data);
    const nextMessages = [...messages, facilitatorMessage];
    const nextMemo = parsedTurn.data.memoUpdate ?? memo;
    const nextContextSummary =
      parsedTurn.data.contextSummaryUpdate ?? contextSummary;

    onTurnUpdated(parsedTurn.data);
    dispatch({
      type: "set_turn",
      messages: nextMessages,
      turn: parsedTurn.data,
      contextSummary: nextContextSummary,
      expertRepliesSinceUser,
    });
    if (shouldPause()) return;
    if (
      parsedTurn.data.requestedSpeaker.speakerType === "expert" &&
      expertRepliesSinceUser < 2
    ) {
      await requestExpertReply({
        consultation,
        turn: parsedTurn.data,
        experts,
        messages: nextMessages,
        expertRepliesSinceUser,
        memo: nextMemo,
        contextSummary: nextContextSummary,
      });
    }
  }

  return {
    state,
    isLoading,
    errorMessage,
    begin,
    retryExpertReply,
    submitUserAnswer,
    restore,
    reset,
    changeOtherAnswer,
  };
}

function addParticipantIds(
  experts: ExpertRequest[],
): ConfirmedGroupChatExpert[] {
  return experts.map((expert, index) => ({
    ...expert,
    participantId: `expert-${index + 1}`,
  }));
}

function getGroupChatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "通信に失敗しました。";
}
