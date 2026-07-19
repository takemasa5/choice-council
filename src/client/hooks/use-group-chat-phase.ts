import { useReducer, useState } from "react";
import type {
  FacilitatorTurn,
  GroupChatMessage,
} from "../../shared/schemas/session";
import { groupChatReducer, initialGroupChatState } from "../group-chat-state";

/**
 * 日本語名: 意見交換フェーズだけで使うreducer状態を管理するHook。
 *
 * 仕様対応: `docs/tasks/main-ui-component-refactor-plan.md#状態と副作用の境界`。
 */
export function useGroupChatPhase() {
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

  return {
    state,
    dispatch,
    isLoading,
    setIsLoading,
    errorMessage,
    setErrorMessage,
    createFacilitatorMessage,
    createUserMessage,
    postJson,
  };
}
