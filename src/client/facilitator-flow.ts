import type {
  ConsultationStartRequest,
  ExpertRequest,
  FacilitatorResponse,
  FacilitatorResponseRequest,
  Phase,
  SessionMemo,
} from "../shared/schemas/session";
import { maximumExpertRequestCount } from "../shared/schemas/session";

/** 日本語名: 専門家候補の確定結果。 */
export type ExpertDraftConfirmation =
  | { experts: ExpertRequest[]; errorMessage: "" }
  | { experts: []; errorMessage: string };

/** 日本語名: 相談開始画面の入力値。 */
export type ConsultationStartInput = {
  consultation: string;
  facts: string;
  values: string;
  concerns: string;
  expectedOutcome: string;
};

/** 日本語名: 明示的リトライ用に保持する失敗リクエスト。 */
export type FailedFacilitatorRequest =
  | {
      endpoint: "start";
      request: ConsultationStartRequest;
    }
  | {
      endpoint: "respond";
      request: FacilitatorResponseRequest;
    };

/** 日本語名: 前提整理の確認回答入力値。 */
export type FacilitatorResponseInput = {
  consultation: string;
  currentPhase: Phase;
  userQuestion: FacilitatorResponse["user_question"] | undefined;
  userQuestionAnswer: string | undefined;
  memo: SessionMemo | null | undefined;
};

/**
 * 相談開始 API に送る初回入力を作成する。
 *
 * 仕様対応: `docs/api/schemas.md#POST /api/facilitator/start`。
 */
export function buildConsultationStartRequest(
  input: ConsultationStartInput,
): ConsultationStartRequest {
  const facts = emptyToUndefined(input.facts);
  const values = emptyToUndefined(input.values);
  const concerns = emptyToUndefined(input.concerns);
  const expectedOutcome = emptyToUndefined(input.expectedOutcome);

  return {
    consultation: input.consultation,
    ...(facts ? { facts } : {}),
    ...(values ? { values } : {}),
    ...(concerns ? { concerns } : {}),
    ...(expectedOutcome ? { expectedOutcome } : {}),
  };
}

/**
 * 前提整理の必須質問回答 API に送る入力を作成する。
 *
 * 仕様対応: `docs/tasks/milestone-2.md#前提整理での確認回答`。
 */
export function buildFacilitatorResponseRequest(
  input: FacilitatorResponseInput,
): FacilitatorResponseRequest | null {
  if (
    input.currentPhase !== "premise" ||
    !input.userQuestion ||
    !input.memo ||
    !input.userQuestionAnswer
  ) {
    return null;
  }

  return {
    consultation: input.consultation,
    currentPhase: "premise",
    userQuestion: input.userQuestion,
    userQuestionAnswer: input.userQuestionAnswer,
    memo: input.memo,
  };
}

/**
 * 明示的リトライで同一内容を再送するため、失敗した API 入力を保持する。
 *
 * 仕様対応: `docs/tasks/milestone-2.md#API エラー表示`。
 */
export function createFailedFacilitatorRequest(
  failedRequest: FailedFacilitatorRequest,
): FailedFacilitatorRequest {
  return failedRequest;
}

/** 日本語名: 開始済みセッションで使う確定相談内容を選ぶ関数。 */
export function getSessionConsultation(
  startedConsultation: string,
  consultation: string,
) {
  return startedConsultation || consultation;
}

/** ファシリテーター応答の候補行動に対応するアプリ側フェーズを決める。 */
export function getFacilitatorResponsePhase(
  response: Pick<FacilitatorResponse, "next_action">,
) {
  return response.next_action === "request_experts"
    ? "expert_selection"
    : "premise";
}

/** 前提整理の完了後に、専門家選定へ進める応答かを判定する。 */
export function canProceedToExpertSelection(
  response: Pick<FacilitatorResponse, "next_action" | "user_question"> | null,
) {
  return response?.next_action === "request_experts" && !response.user_question;
}

/**
 * 上限未満のときだけ、末尾に編集中の空の専門家候補行を追加する。
 *
 * 仕様対応: `docs/tasks/milestone-3.md#専門家候補の表示と編集`。
 */
export function addExpertDraft(drafts: ExpertRequest[]): ExpertRequest[] {
  if (drafts.length >= maximumExpertRequestCount) return drafts;

  return [
    ...drafts,
    {
      role_name: "",
      viewpoint: "",
      request: "",
    },
  ];
}

/**
 * 指定した候補を、3項目すべて未入力の編集可能な候補行に戻す。
 *
 * 仕様対応: `docs/tasks/milestone-3.md#専門家候補の表示と編集`。
 */
export function replaceExpertDraft(
  drafts: ExpertRequest[],
  index: number,
): ExpertRequest[] {
  return drafts.map((draft, currentIndex) => {
    if (currentIndex !== index) return draft;

    return {
      role_name: "",
      viewpoint: "",
      request: "",
    };
  });
}

/**
 * 専門家候補をtrimして確定可否を判定し、空行を確定対象から除外する。
 *
 * 仕様対応: `docs/tasks/milestone-3.md#専門家候補の表示と編集`。
 */
export function confirmExpertDrafts(
  drafts: ExpertRequest[],
): ExpertDraftConfirmation {
  const trimmedDrafts = drafts.map((draft) => ({
    role_name: draft.role_name.trim(),
    viewpoint: draft.viewpoint.trim(),
    request: draft.request.trim(),
  }));
  const hasIncompleteDraft = trimmedDrafts.some((draft) => {
    const enteredFieldCount = [
      draft.role_name,
      draft.viewpoint,
      draft.request,
    ].filter(Boolean).length;
    return enteredFieldCount > 0 && enteredFieldCount < 3;
  });

  if (hasIncompleteDraft) {
    return {
      experts: [],
      errorMessage:
        "追加した専門家ロールの役割名、観点、依頼をすべて入力してください。",
    };
  }

  const experts = trimmedDrafts.filter(
    (draft) => draft.role_name && draft.viewpoint && draft.request,
  );

  if (experts.length === 0) {
    return {
      experts: [],
      errorMessage: "確定する専門家ロールを1件以上入力してください。",
    };
  }

  return { experts, errorMessage: "" };
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
