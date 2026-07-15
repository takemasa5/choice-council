import type {
  ConsultationStartRequest,
  FacilitatorResponse,
  FacilitatorResponseRequest,
  Phase,
  SessionMemo,
} from "../shared/schemas/session";

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

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
