import type {
  ConsultationRequest,
  ConsultationStartRequest,
  ExpertComment,
  ExpertRequest,
  FacilitatorResponse,
  FacilitatorTurn,
  GroupChatMessage,
  Phase,
  SessionMemo,
} from "../shared/schemas/session";
import { recoverInterruptedFinalMemo } from "./final-memo-restoration";
import {
  clearResponseHistory,
  createResponseForPhase,
  createResponseHistoryForNewConsultation,
  getReturnablePhases,
  keepResponsesThroughPhase,
  phaseOrder,
  type ResponseHistory,
} from "./phase-history";
import { restoreSessionPhase } from "./session-phase-restoration";
import type { ExpertDraft } from "./hooks/use-expert-selection-phase";

export type SessionState = {
  startedConsultation: string;
  response: FacilitatorResponse | null;
  responseHistory: ResponseHistory;
  currentPhase: Phase;
};

export type StoredSession = {
  request: ConsultationRequest;
  startedConsultation?: string;
  response: FacilitatorResponse | null;
  responseHistory?: ResponseHistory;
  currentPhase?: unknown;
  expertComments?: ExpertComment[];
  expertDrafts?: ExpertDraft[];
  expertDraftProvenanceKey?: string;
  initialExpertRequests?: ExpertRequest[];
  confirmedExperts?: ExpertRequest[];
  groupChatMessages?: GroupChatMessage[];
  groupChatTurn?: FacilitatorTurn;
  groupChatContextSummary?: string;
  groupChatExpertRepliesSinceUser?: number;
  groupChatNextTurnRetryPending?: boolean;
  finalMarkdown?: string;
};

export function createInitialSessionState(): SessionState {
  return {
    startedConsultation: "",
    response: null,
    responseHistory: clearResponseHistory(),
    currentPhase: "consultation_input",
  };
}

/** 保存済みのフェーズ横断状態を復元し、生成中断した終了メモも復旧する。 */
export function restoreStoredSessionState(parsed: StoredSession): SessionState {
  const restoredPhase = restoreSessionPhase(
    parsed.currentPhase,
    parsed.response?.current_phase,
  );
  const restoredSession = recoverInterruptedFinalMemo({
    currentPhase: restoredPhase,
    response: parsed.response,
    responseHistory:
      parsed.responseHistory ?? responseToHistory(parsed.response),
    finalMarkdown: parsed.finalMarkdown ?? "",
  });

  return {
    startedConsultation:
      parsed.startedConsultation ??
      (parsed.response ? parsed.request.consultation : ""),
    response: restoredSession.response,
    responseHistory: restoredSession.responseHistory,
    currentPhase: restoredSession.currentPhase,
  };
}

/** 新規相談の開始応答を横断状態へ反映する。 */
export function startSession(
  request: ConsultationStartRequest,
  facilitatorResponse: FacilitatorResponse,
  nextPhase: Phase,
): SessionState {
  const response = createResponseForPhase(facilitatorResponse, nextPhase);
  return {
    startedConsultation: request.consultation,
    response,
    responseHistory: createResponseHistoryForNewConsultation(
      facilitatorResponse,
      response,
      nextPhase,
    ),
    currentPhase: nextPhase,
  };
}

/** 前提整理の回答応答を横断状態へ反映する。 */
export function applyPremiseSessionResponse(
  state: SessionState,
  facilitatorResponse: FacilitatorResponse,
  nextPhase: Phase,
): SessionState {
  const response = createResponseForPhase(facilitatorResponse, nextPhase);
  return {
    ...state,
    currentPhase: nextPhase,
    response,
    responseHistory: {
      ...state.responseHistory,
      premise: facilitatorResponse,
      ...(nextPhase === "expert_selection"
        ? { expert_selection: response }
        : {}),
    },
  };
}

/** 前提整理を完了して専門家選定へ進む。 */
export function proceedToExpertSelection(state: SessionState): SessionState {
  if (!state.response) return state;

  const response = createResponseForPhase(state.response, "expert_selection");
  return {
    ...state,
    currentPhase: "expert_selection",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, "premise"),
      premise: state.responseHistory.premise ?? state.response,
      expert_selection: response,
    },
  };
}

/** 専門家コメント生成後の検討フェーズとメモを同時に確定する。 */
export function settleExpertComments(
  state: SessionState,
  updatedMemo: SessionMemo,
): SessionState {
  if (!state.response) return state;

  const response = {
    ...createResponseForPhase(state.response, "deliberation"),
    memo_updates: updatedMemo,
  };
  return {
    ...state,
    currentPhase: "deliberation",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, state.currentPhase),
      deliberation: response,
    },
  };
}

/** 意見交換開始時のターンとメモを横断状態へ反映する。 */
export function settleGroupChatStart(
  state: SessionState,
  turn: FacilitatorTurn,
): SessionState {
  if (!state.response) return state;

  const nextResponse = createResponseForPhase(state.response, "group_chat");
  const response = turn.memoUpdate
    ? { ...nextResponse, memo_updates: turn.memoUpdate }
    : nextResponse;
  return {
    ...state,
    currentPhase: "group_chat",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, state.currentPhase),
      group_chat: response,
    },
  };
}

/** 意見交換中に受け取ったメモ更新を現在の応答と履歴へ反映する。 */
export function applyGroupChatMemoUpdate(
  state: SessionState,
  memoUpdate: SessionMemo,
): SessionState {
  if (!state.response || !state.responseHistory.group_chat) return state;

  return {
    ...state,
    response: { ...state.response, memo_updates: memoUpdate },
    responseHistory: {
      ...state.responseHistory,
      group_chat: {
        ...state.responseHistory.group_chat,
        memo_updates: memoUpdate,
      },
    },
  };
}

/** 終了メモの確定後、終了メモフェーズへ遷移する。 */
export function settleFinalMemo(
  state: SessionState,
  finalMemo: SessionMemo,
): SessionState {
  if (!state.response) return state;

  const groupChatResponse = { ...state.response, memo_updates: finalMemo };
  const response = createResponseForPhase(groupChatResponse, "final_memo");
  return {
    ...state,
    currentPhase: "final_memo",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, "group_chat"),
      group_chat: groupChatResponse,
      final_memo: response,
    },
  };
}

/** 終了メモの生成失敗後、進行中のメモを保持して意見交換へ戻す。 */
export function restoreGroupChatAfterFinalMemoFailure(
  state: SessionState,
  inProgressMemo: SessionMemo,
): SessionState {
  if (!state.response) return state;

  const response = {
    ...createResponseForPhase(state.response, "group_chat"),
    memo_updates: inProgressMemo,
  };
  return {
    ...state,
    currentPhase: "group_chat",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, "group_chat"),
      group_chat: response,
    },
  };
}

/** 専門家の確定内容を現在フェーズの応答と履歴へ保存する。 */
export function saveConfirmedExperts(
  state: SessionState,
  experts: ExpertRequest[],
): SessionState {
  if (!state.response) return state;

  const nextPhase =
    state.currentPhase === "premise" ? "expert_selection" : state.currentPhase;
  const response = createResponseForPhase(state.response, nextPhase, experts);
  return {
    ...state,
    currentPhase: nextPhase,
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, state.currentPhase),
      [nextPhase]: response,
    },
  };
}

/** 指定フェーズへ戻るため、後続する応答履歴を破棄する。 */
export function returnToPhase(
  state: SessionState,
  targetPhase: Phase,
): SessionState {
  const responseHistory =
    targetPhase === "consultation_input"
      ? clearResponseHistory()
      : keepResponsesThroughPhase(state.responseHistory, targetPhase);
  return {
    ...state,
    currentPhase: targetPhase,
    response: responseHistory[targetPhase] ?? null,
    responseHistory,
  };
}

export function getCurrentSessionMemo(state: SessionState) {
  return (
    state.response?.memo_updates ??
    getLatestMemoBeforePhase(state.responseHistory, state.currentPhase)
  );
}

export function getAvailableReturnPhases(state: SessionState) {
  return getReturnablePhases(state.currentPhase, state.responseHistory);
}

export function createSessionRequest({
  consultation,
  facts,
  values,
  concerns,
  expectedOutcome,
  userQuestionAnswer,
  state,
}: {
  consultation: string;
  facts: string;
  values: string;
  concerns: string;
  expectedOutcome: string;
  userQuestionAnswer?: string;
  state: SessionState;
}): ConsultationRequest {
  return {
    consultation,
    facts: emptyToUndefined(facts),
    values: emptyToUndefined(values),
    concerns: emptyToUndefined(concerns),
    expectedOutcome: emptyToUndefined(expectedOutcome),
    userQuestion: state.response?.user_question ?? undefined,
    userQuestionAnswer,
    currentPhase: state.currentPhase,
    memo: getCurrentSessionMemo(state) ?? undefined,
  };
}

export function createStoredSession({
  request,
  state,
  expertComments,
  expertDrafts,
  expertDraftProvenanceKey,
  initialExpertRequests,
  confirmedExperts,
  groupChatMessages,
  groupChatTurn,
  groupChatContextSummary,
  groupChatExpertRepliesSinceUser,
  groupChatNextTurnRetryPending,
  finalMarkdown,
}: Omit<
  StoredSession,
  "response" | "responseHistory" | "currentPhase" | "startedConsultation"
> & {
  state: SessionState;
}): StoredSession {
  return {
    request,
    startedConsultation: state.startedConsultation || undefined,
    response: state.response,
    responseHistory: state.responseHistory,
    currentPhase: state.currentPhase,
    expertComments,
    expertDrafts,
    expertDraftProvenanceKey: expertDraftProvenanceKey ?? undefined,
    confirmedExperts,
    groupChatMessages,
    groupChatTurn: groupChatTurn ?? undefined,
    groupChatContextSummary: groupChatContextSummary || undefined,
    groupChatExpertRepliesSinceUser,
    groupChatNextTurnRetryPending: groupChatNextTurnRetryPending || undefined,
    initialExpertRequests,
    finalMarkdown: finalMarkdown || undefined,
  };
}

function responseToHistory(
  response: FacilitatorResponse | null,
): ResponseHistory {
  return response ? { [response.current_phase]: response } : {};
}

function getLatestMemoBeforePhase(
  responseHistory: ResponseHistory,
  targetPhase: Phase,
) {
  const targetIndex = phaseOrder.indexOf(targetPhase);

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const phase = phaseOrder[index];
    const memo = responseHistory[phase]?.memo_updates;
    if (memo) return memo;
  }

  return null;
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
