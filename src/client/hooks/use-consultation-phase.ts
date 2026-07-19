import { useState } from "react";

/**
 * 日本語名: 相談入力フェーズだけで使う表示状態を管理する Hook。
 *
 * 仕様対応: `docs/tasks/main-ui-component-refactor-plan.md#状態と副作用の境界`。
 */
export function useConsultationPhase() {
  const [consultation, setConsultation] = useState("");
  const [facts, setFacts] = useState("");
  const [values, setValues] = useState("");
  const [concerns, setConcerns] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [showOptionalFields, setShowOptionalFields] = useState(false);

  return {
    consultation,
    setConsultation,
    facts,
    setFacts,
    values,
    setValues,
    concerns,
    setConcerns,
    expectedOutcome,
    setExpectedOutcome,
    showOptionalFields,
    toggleOptionalFields: () => setShowOptionalFields((current) => !current),
  };
}
