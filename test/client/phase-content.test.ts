import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PhaseContent,
  selectPhaseContent,
} from "../../src/client/phases/PhaseContent";
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

test("検討中は相談入力UIではなく検討UIだけを描画する", () => {
  const content = Object.fromEntries(
    phases.map((phase) => [
      phase,
      createElement("section", { "data-phase": phase }, `${phase}-content`),
    ]),
  ) as Record<Phase, ReactNode>;

  const markup = renderToStaticMarkup(
    createElement(PhaseContent, {
      currentPhase: "deliberation",
      content,
      renderResponse: (phaseContent) =>
        createElement("article", { "data-role": "response" }, phaseContent),
    }),
  );

  assert.match(markup, /data-phase="deliberation"/);
  assert.doesNotMatch(markup, /data-phase="consultation_input"/);
});
