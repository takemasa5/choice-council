import type { ReactNode } from "react";
import type { FacilitatorResponse } from "../../shared/schemas/session";

const nextActionLabels: Record<FacilitatorResponse["next_action"], string> = {
  wait_user: "ユーザー回答待ち",
  request_experts: "専門家コメント生成候補",
  update_memo: "セッションメモ更新候補",
  move_phase: "次フェーズ候補",
  finish: "終了候補",
};

/** 日本語名: フェーズ固有の表示をファシリテーター応答カード内へ配置する。 */
export function FacilitatorResponseCard({
  response,
  children,
}: {
  response: FacilitatorResponse | null;
  children: ReactNode;
}) {
  if (!response) return null;

  return (
    <article className="message-card">
      <div className="message-label">ファシリテーター</div>
      <p>{response.facilitator_message}</p>
      <p className="next-action">
        候補行動: {nextActionLabels[response.next_action]}
      </p>
      {children}
    </article>
  );
}
