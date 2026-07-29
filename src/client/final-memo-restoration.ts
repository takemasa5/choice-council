import type {
  FacilitatorResponse,
  Phase,
  SessionMemo,
} from "../shared/schemas/session";
import {
  keepResponsesThroughPhase,
  type ResponseHistory,
} from "./phase-history";
import { resetFinalMemoStatus } from "./final-memo-flow";

/** 日本語名: 保存済み終了メモの生成中断を意見交換へ復旧する。 */
export function recoverInterruptedFinalMemo({
  currentPhase,
  response,
  responseHistory,
  finalMarkdown,
}: {
  currentPhase: Phase;
  response: FacilitatorResponse | null;
  responseHistory: ResponseHistory;
  finalMarkdown: string;
}) {
  if (currentPhase !== "final_memo" || finalMarkdown) {
    return { currentPhase, response, responseHistory };
  }

  const finalMemo = getFinalMemo(response, responseHistory);
  const inProgressMemo = finalMemo
    ? resetFinalMemoStatus(finalMemo)
    : undefined;
  const groupChatResponse =
    responseHistory.group_chat ?? response ?? responseHistory.final_memo;
  const recoveredResponse = groupChatResponse
    ? {
        ...groupChatResponse,
        current_phase: "group_chat" as const,
        memo_updates: inProgressMemo ?? groupChatResponse.memo_updates,
      }
    : null;

  return {
    currentPhase: "group_chat" as const,
    response: recoveredResponse,
    responseHistory: {
      ...keepResponsesThroughPhase(responseHistory, "group_chat"),
      ...(recoveredResponse ? { group_chat: recoveredResponse } : {}),
    },
  };
}

function getFinalMemo(
  response: FacilitatorResponse | null,
  responseHistory: ResponseHistory,
): SessionMemo | undefined {
  return (
    response?.memo_updates ??
    responseHistory.final_memo?.memo_updates ??
    responseHistory.group_chat?.memo_updates
  );
}
