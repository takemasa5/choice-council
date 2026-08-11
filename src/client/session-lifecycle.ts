import type {
  ConsultationRequest,
  ConsultationStartRequest,
  DiscussionSelection,
  ExpertComment,
  ExpertRequest,
  FacilitatorResponse,
  FacilitatorTurn,
  GroupChatMessage,
  Phase,
  SessionMemo,
} from "../shared/schemas/session";
import {
  DiscussionSelectionSchema,
  ExpertCommentSchema,
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
  discussionSelection?: DiscussionSelection;
  selectedProposalIds?: string[];
  finalMarkdown?: string;
};

/** 保存データから安全に利用できる初回案と選択の状態。 */
export type RestoredProposalState = {
  expertComments: ExpertComment[];
  discussionSelection: DiscussionSelection | null;
  selectedProposalIds: string[];
  isValid: boolean;
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
  const normalizedSession = normalizeStoredSessionMemos(parsed);
  const restoredPhase = restoreSessionPhase(
    normalizedSession.currentPhase,
    normalizedSession.response?.current_phase,
  );
  const restoredSession = recoverInterruptedFinalMemo({
    currentPhase: restoredPhase,
    response: normalizedSession.response,
    responseHistory:
      normalizedSession.responseHistory ??
      responseToHistory(normalizedSession.response),
    finalMarkdown: normalizedSession.finalMarkdown ?? "",
  });

  const restoredState = {
    startedConsultation:
      normalizedSession.startedConsultation ??
      (normalizedSession.response
        ? normalizedSession.request.consultation
        : ""),
    response: restoredSession.response,
    responseHistory: restoredSession.responseHistory,
    currentPhase: restoredSession.currentPhase,
  };

  const proposalState = getRestoredProposalState(normalizedSession);
  if (
    !isStoredProposalStateComplete(restoredState.currentPhase, proposalState)
  ) {
    return recoverToExpertSelection(restoredState);
  }

  return restoredState;
}

/** 旧保存形式のメモを、現行のAPI入力として送信可能な形へ正規化する。 */
function normalizeStoredSessionMemos(session: StoredSession): StoredSession {
  return {
    ...session,
    request: session.request.memo
      ? { ...session.request, memo: normalizeSessionMemo(session.request.memo) }
      : session.request,
    response: normalizeResponseMemo(session.response),
    responseHistory: session.responseHistory
      ? normalizeResponseHistory(session.responseHistory)
      : undefined,
  };
}

/** 保存済み応答のメモだけを、応答本体の復元安全性を変えずに置き換える。 */
function normalizeResponseMemo(
  response: FacilitatorResponse | null,
): FacilitatorResponse | null {
  return response
    ? { ...response, memo_updates: normalizeSessionMemo(response.memo_updates) }
    : null;
}

/** 保存済み履歴中のすべてのメモを現行制約へ正規化する。 */
function normalizeResponseHistory(responseHistory: ResponseHistory) {
  return Object.fromEntries(
    Object.entries(responseHistory).map(([phase, response]) => [
      phase,
      normalizeResponseMemo(response),
    ]),
  ) as ResponseHistory;
}

/** 現行のSessionMemo制約へ、旧形式のメモ本文だけを安全に収める。 */
function normalizeSessionMemo(memo: unknown): SessionMemo {
  const record = isRecord(memo) ? memo : {};

  return {
    theme: normalizeMemoText(record.theme, 120) || "未設定",
    status: normalizeMemoStatus(record.status),
    facts: normalizeMemoItems(record.facts),
    values: normalizeMemoItems(record.values),
    concerns: normalizeMemoItems(record.concerns),
    options: normalizeMemoItems(record.options),
    decision_axes: normalizeMemoItems(record.decision_axes),
    expert_summaries: normalizeMemoItems(record.expert_summaries),
    conflicts: normalizeMemoItems(record.conflicts),
    open_questions: normalizeMemoItems(record.open_questions),
    next_actions: normalizeMemoItems(record.next_actions),
  };
}

/** 旧メモの表示文字列をトリム・平文化して現行の文字数上限に収める。 */
function normalizeMemoText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .replace(
      /^[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|`{3,}[ \t]*)/,
      "",
    )
    .trim()
    .slice(0, maximumLength);
}

/** 配列は空要素を除外し、現行上限の先頭3件だけを残す。 */
function normalizeMemoItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeMemoText(item, 80))
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

/** 旧保存値の不明なstatusは、継続可能な進行中状態へ戻す。 */
function normalizeMemoStatus(value: unknown): SessionMemo["status"] {
  return value === "tentative_conclusion" ||
    value === "pending_decision" ||
    value === "pending_research" ||
    value === "pending_family_discussion" ||
    value === "action_plan"
    ? value
    : "in_progress";
}

/** unknownを安全にキー参照できるレコードか判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 端末保存値を検証し、画面表示・API送信に安全な案選択だけを返す。 */
export function getRestoredProposalState(
  parsed: StoredSession,
): RestoredProposalState {
  const commentsResult = ExpertCommentSchema.array().safeParse(
    parsed.expertComments ?? [],
  );
  const selectionResult = parsed.discussionSelection
    ? DiscussionSelectionSchema.safeParse(parsed.discussionSelection)
    : null;
  const expertComments = commentsResult.success ? commentsResult.data : [];
  const discussionSelection = selectionResult?.success
    ? selectionResult.data
    : null;
  const selectedProposalIds = Array.isArray(parsed.selectedProposalIds)
    ? parsed.selectedProposalIds.filter(
        (id): id is string => typeof id === "string" && Boolean(id.trim()),
      )
    : [];
  const proposalIds = expertComments.map((comment) => comment.proposal.id);
  const selectedByDiscussion =
    discussionSelection?.kind === "deep_dive"
      ? [discussionSelection.proposalId]
      : discussionSelection?.kind === "compare"
        ? discussionSelection.proposalIds
        : [];
  const commentsMatchExperts =
    !parsed.confirmedExperts ||
    parsed.confirmedExperts.length === 0 ||
    (parsed.confirmedExperts.length === expertComments.length &&
      parsed.confirmedExperts.every(
        (expert, index) =>
          expert.role_name === expertComments[index]?.role_name &&
          expert.viewpoint === expertComments[index]?.viewpoint,
      ));
  const areSelectedProposalIdsValid =
    selectedProposalIds.length === new Set(selectedProposalIds).size &&
    selectedProposalIds.every((id) => proposalIds.includes(id));
  const areDiscussionReferencesValid = selectedByDiscussion.every((id) =>
    proposalIds.includes(id),
  );
  const doStoredSelectionAndCheckedIdsMatch =
    discussionSelection?.kind === "deep_dive"
      ? selectedProposalIds.length === 1 &&
        selectedProposalIds[0] === discussionSelection.proposalId
      : discussionSelection?.kind === "compare"
        ? selectedProposalIds.length === 2 &&
          selectedProposalIds.every((id) =>
            discussionSelection.proposalIds.includes(id),
          )
        : discussionSelection?.kind === "defer"
          ? selectedProposalIds.length === 0
          : true;
  const areProposalIdsUnique = proposalIds.length === new Set(proposalIds).size;
  const isValid =
    commentsResult.success &&
    (!parsed.discussionSelection || selectionResult?.success === true) &&
    areProposalIdsUnique &&
    areSelectedProposalIdsValid &&
    areDiscussionReferencesValid &&
    doStoredSelectionAndCheckedIdsMatch &&
    commentsMatchExperts;

  return {
    expertComments: isValid ? expertComments : [],
    discussionSelection: isValid ? discussionSelection : null,
    selectedProposalIds: isValid ? selectedProposalIds : [],
    isValid,
  };
}

/** フェーズ再開に必要な初回案と選択がそろっているかを判定する。 */
export function isStoredProposalStateComplete(
  phase: Phase,
  proposalState: RestoredProposalState,
) {
  if (!isProposalStateRequired(phase)) return true;
  if (!proposalState.isValid || proposalState.expertComments.length === 0) {
    return false;
  }
  return phase === "deliberation" || proposalState.discussionSelection !== null;
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
  discussionSelection,
  selectedProposalIds,
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
    discussionSelection,
    selectedProposalIds,
    initialExpertRequests,
    finalMarkdown: finalMarkdown || undefined,
  };
}

function responseToHistory(
  response: FacilitatorResponse | null,
): ResponseHistory {
  return response ? { [response.current_phase]: response } : {};
}

function isProposalStateRequired(phase: Phase) {
  return (
    phase === "deliberation" || phase === "group_chat" || phase === "final_memo"
  );
}

/** 不正な案保存値では、確定済み専門家を保持できる選定フェーズへ戻す。 */
function recoverToExpertSelection(state: SessionState): SessionState {
  if (!state.response) return createInitialSessionState();

  const response = createResponseForPhase(state.response, "expert_selection");
  return {
    ...state,
    currentPhase: "expert_selection",
    response,
    responseHistory: {
      ...keepResponsesThroughPhase(state.responseHistory, "premise"),
      expert_selection: response,
    },
  };
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
