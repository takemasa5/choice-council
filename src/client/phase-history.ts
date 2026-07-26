import type {
  ExpertComment,
  ExpertRequest,
  FacilitatorResponse,
  Phase,
} from "../shared/schemas/session";

/** 日本語名: フェーズごとのファシリテーター応答履歴。 */
export type ResponseHistory = Partial<Record<Phase, FacilitatorResponse>>;

/**
 * 現在地点より前で、復元可能なフェーズだけを戻り先として返す。
 *
 * 専門家コメントは独立した履歴を持たないため、検討をやり直す場合は
 * 専門家選定へ戻って再生成する。
 */
export function getReturnablePhases(
  currentPhase: Phase,
  responseHistory: ResponseHistory,
) {
  const currentIndex = phaseOrder.indexOf(currentPhase);
  if (currentIndex <= 0) return [];

  return phaseOrder.slice(0, currentIndex).filter((phase) => {
    return (
      (phase !== "deliberation" ||
        currentPhase === "group_chat" ||
        currentPhase === "final_memo") &&
      (phase === "consultation_input" || Boolean(responseHistory[phase]))
    );
  });
}

/** 戻り先の状態を残し、それより後の履歴を破棄する。 */
export function keepResponsesThroughPhase(
  responseHistory: ResponseHistory,
  targetPhase: Phase,
) {
  const targetIndex = phaseOrder.indexOf(targetPhase);

  return Object.fromEntries(
    Object.entries(responseHistory).filter(([phase]) => {
      return phaseOrder.indexOf(phase as Phase) <= targetIndex;
    }),
  ) as ResponseHistory;
}

/** 相談入力へ戻るときは、すべてのファシリテーター応答を破棄する。 */
export function clearResponseHistory(): ResponseHistory {
  return {};
}

/**
 * 新しい相談の開始応答だけを履歴として保持する。
 *
 * 仕様対応: `docs/design/safety-and-privacy.md#保存とプライバシー`、
 * `docs/design/memo-and-output.md#Markdown 終了メモ`。
 */
export function createResponseHistoryForNewConsultation(
  premiseResponse: FacilitatorResponse,
  nextResponse: FacilitatorResponse,
  phase: Phase,
): ResponseHistory {
  return {
    premise: premiseResponse,
    ...(phase === "expert_selection" ? { expert_selection: nextResponse } : {}),
  };
}

/** 検討へ戻る場合だけ、根拠となる専門家コメントを残す。 */
export function getExpertCommentsForReturn(
  targetPhase: Phase,
  expertComments: ExpertComment[],
) {
  return targetPhase === "deliberation" ? expertComments : [];
}

/** 専門家選定以降へ戻る場合だけ、確定済み専門家を維持する。 */
export function getConfirmedExpertsForReturn(
  targetPhase: Phase,
  confirmedExperts: ExpertRequest[],
) {
  return targetPhase === "expert_selection" ||
    targetPhase === "deliberation" ||
    targetPhase === "group_chat"
    ? confirmedExperts
    : [];
}

/** 指定フェーズ用の応答を作り、専門家ロールの編集内容も保持する。 */
export function createResponseForPhase(
  response: FacilitatorResponse,
  phase: Phase,
  expertRequests = response.expert_requests,
): FacilitatorResponse {
  return {
    ...response,
    current_phase: phase,
    expert_requests: expertRequests,
  };
}

export const phaseOrder: Phase[] = [
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "group_chat",
  "final_memo",
];
