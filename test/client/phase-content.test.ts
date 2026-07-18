import assert from "node:assert/strict";
import test from "node:test";
import { selectPhaseContent } from "../../src/client/phases/PhaseContent";
import type { Phase } from "../../src/shared/schemas/session";

const phases: Phase[] = [
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "group_chat",
  "final_memo",
];

test("現在フェーズに対応するUIは PhaseContent の唯一の分岐で選ばれる", () => {
  const content = Object.fromEntries(
    phases.map((phase) => [phase, `${phase}-content`]),
  ) as Record<Phase, string>;

  for (const phase of phases) {
    assert.equal(selectPhaseContent(phase, content), `${phase}-content`);
  }
});
