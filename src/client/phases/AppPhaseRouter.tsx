import type { ReactNode } from "react";
import type { FacilitatorResponse, Phase } from "../../shared/schemas/session";
import { FacilitatorResponseCard } from "./FacilitatorResponseCard";
import { PhaseContent } from "./PhaseContent";

/** 日本語名: フェーズUIを選択するだけのアプリケーションルーター。 */
export function AppPhaseRouter({
  currentPhase,
  content,
  response,
}: {
  currentPhase: Phase;
  content: Record<Phase, ReactNode>;
  response: FacilitatorResponse | null;
}) {
  return (
    <PhaseContent
      currentPhase={currentPhase}
      content={content}
      renderResponse={(phaseContent) => (
        <FacilitatorResponseCard response={response}>
          {phaseContent}
        </FacilitatorResponseCard>
      )}
    />
  );
}
