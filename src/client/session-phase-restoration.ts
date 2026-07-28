import { PhaseSchema, type Phase } from "../shared/schemas/session";

/** 日本語名: 保存済みセッションの旧フェーズを現在の安全なフェーズへ復元する。 */
export function restoreSessionPhase(
  currentPhase: unknown,
  responsePhase: unknown,
): Phase {
  const storedPhase = currentPhase ?? responsePhase;

  if (storedPhase === "direction") return "deliberation";

  const parsedPhase = PhaseSchema.safeParse(storedPhase);
  return parsedPhase.success ? parsedPhase.data : "consultation_input";
}
