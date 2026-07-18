import assert from "node:assert/strict";
import test from "node:test";
import {
  getExpertCommentsForReturn,
  getReturnablePhases,
  phaseOrder,
} from "../../src/client/phase-history";

const comment = {
  role_name: "専門家",
  viewpoint: "観点",
  summary: "要約",
  key_point: "要点",
  concern: "懸念",
  question_to_user: "質問",
  confidence: "medium" as const,
  needs_research: false,
};

test("グループチャットを含む新しいフェーズ順序を使う", () => {
  assert.deepEqual(phaseOrder, [
    "consultation_input",
    "premise",
    "expert_selection",
    "deliberation",
    "group_chat",
    "final_memo",
  ]);
});

test("検討へ戻るときだけ専門家コメントを保持する", () => {
  assert.deepEqual(getExpertCommentsForReturn("deliberation", [comment]), [
    comment,
  ]);
  assert.deepEqual(getExpertCommentsForReturn("group_chat", [comment]), []);
});

test("グループチャットからは検討フェーズへ戻れる", () => {
  assert.deepEqual(
    getReturnablePhases("group_chat", {
      deliberation: { current_phase: "deliberation" } as never,
    }),
    ["consultation_input", "deliberation"],
  );
});
