import type { ReactNode } from "react";
import type { Phase } from "../../shared/schemas/session";
import { PhaseContent } from "./PhaseContent";

/** 日本語名: フェーズUIを選択するだけのアプリケーションルーター。 */
export function AppPhaseRouter({
  currentPhase,
  content,
  renderResponse,
}: {
  currentPhase: Phase;
  content: Record<Phase, ReactNode>;
  renderResponse: (phaseContent: ReactNode) => ReactNode;
}) {
  return (
    <PhaseContent
      currentPhase={currentPhase}
      content={content}
      renderResponse={renderResponse}
    />
  );
}
