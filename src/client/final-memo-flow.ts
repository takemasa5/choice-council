import type {
  FinalMemoStatus,
  FinalSessionMemo,
  SessionMemo,
} from "../shared/schemas/session";

/** 日本語名: 終了メモで選択できる終了状態。 */
export const finalMemoStatusOptions: ReadonlyArray<{
  status: FinalMemoStatus;
  label: string;
}> = [
  { status: "tentative_conclusion", label: "暫定結論" },
  { status: "pending_decision", label: "判断保留" },
  { status: "pending_research", label: "追加調査待ち" },
  { status: "pending_family_discussion", label: "家族・関係者相談待ち" },
  { status: "action_plan", label: "実行計画" },
];

/** 日本語名: 選択した終了状態を終了メモ生成用のセッションメモへ反映する。 */
export function setFinalMemoStatus(
  memo: SessionMemo,
  status: FinalMemoStatus,
): FinalSessionMemo {
  return { ...memo, status };
}

/** 日本語名: 終了メモ生成失敗時に意見交換を再開できる状態へ戻す。 */
export function resetFinalMemoStatus(memo: SessionMemo): SessionMemo {
  return { ...memo, status: "in_progress" };
}
