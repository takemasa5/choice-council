import type { ReactNode } from "react";
import type { Phase } from "../../shared/schemas/session";

/** 日本語名: フェーズUIを選択する唯一の分岐点。 */
export function PhaseContent({
  currentPhase,
  render,
}: {
  currentPhase: Phase;
  render: (phase: Phase) => ReactNode;
}) {
  return selectPhaseContent(currentPhase, {
    consultation_input: () => render("consultation_input"),
    premise: () => render("premise"),
    expert_selection: () => render("expert_selection"),
    deliberation: () => render("deliberation"),
    group_chat: () => render("group_chat"),
    final_memo: () => render("final_memo"),
  })();
}

/** 日本語名: 現在フェーズに対応するUIを選ぶ純粋関数。 */
export function selectPhaseContent<Content>(
  currentPhase: Phase,
  content: Record<Phase, Content>,
) {
  switch (currentPhase) {
    case "consultation_input":
      return content.consultation_input;
    case "premise":
      return content.premise;
    case "expert_selection":
      return content.expert_selection;
    case "deliberation":
      return content.deliberation;
    case "group_chat":
      return content.group_chat;
    case "final_memo":
      return content.final_memo;
  }
}
