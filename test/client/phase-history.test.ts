import assert from "node:assert/strict";
import test from "node:test";
import {
  getReturnablePhases,
  keepResponsesThroughPhase,
  type ResponseHistory,
} from "../../src/client/phase-history";
import type { FacilitatorResponse } from "../../src/shared/schemas/session";

const response = (phase: FacilitatorResponse["current_phase"]) =>
  ({ current_phase: phase }) as FacilitatorResponse;

test("方向性整理からは専門家選定へ戻り、検討を直接の戻り先にしない", () => {
  const history: ResponseHistory = {
    premise: response("premise"),
    expert_selection: response("expert_selection"),
    direction: response("direction"),
  };

  assert.deepEqual(getReturnablePhases("direction", history), [
    "consultation_input",
    "premise",
    "expert_selection",
  ]);
});

test("専門家選定へ戻るとその入力状態を残して後続履歴を破棄する", () => {
  const expertSelection = response("expert_selection");
  const history: ResponseHistory = {
    premise: response("premise"),
    expert_selection: expertSelection,
    direction: response("direction"),
  };

  assert.deepEqual(keepResponsesThroughPhase(history, "expert_selection"), {
    premise: history.premise,
    expert_selection: expertSelection,
  });
});
