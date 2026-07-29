import type { ReactNode } from "react";
import type { Phase } from "../shared/schemas/session";

/** 日本語名: PhaseContent が受け取るフェーズ別UI。 */
export type PhaseContentProps = {
  currentPhase: Phase;
  consultationInput: ReactNode;
  premise: ReactNode;
  expertSelection: ReactNode;
  deliberation: ReactNode;
  groupChat: ReactNode;
  finalMemo: ReactNode;
};
