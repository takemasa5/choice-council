import assert from "node:assert/strict";
import test from "node:test";
import {
  getConfirmedExpertsForReturn,
  getExpertCommentsForReturn,
  getReturnablePhases,
  phaseOrder,
} from "../../src/client/phase-history";

const comment = {
  role_name: "専門家",
  viewpoint: "観点",
  summary: "要約",
  proposal: {
    id: "proposal-1",
    name: "案",
    content: "内容",
    benefits: ["利点"],
    sacrifices: ["犠牲"],
    conditions: ["条件"],
  },
  key_point: "要点",
  concern: "懸念",
  question_to_user: "質問",
  confidence: "medium" as const,
  needs_research: false,
};

const expert = {
  role_name: "専門家",
  viewpoint: "観点",
  request: "論点を整理してください",
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
});

test("意見交換へ戻るときは専門家コメントを保持する", () => {
  assert.deepEqual(getExpertCommentsForReturn("group_chat", [comment]), [
    comment,
  ]);
});

test("専門家選定以降へ戻るときは確定済み専門家を保持する", () => {
  assert.deepEqual(getConfirmedExpertsForReturn("expert_selection", [expert]), [
    expert,
  ]);
  assert.deepEqual(getConfirmedExpertsForReturn("deliberation", [expert]), [
    expert,
  ]);
  assert.deepEqual(getConfirmedExpertsForReturn("group_chat", [expert]), [
    expert,
  ]);
  assert.deepEqual(getConfirmedExpertsForReturn("premise", [expert]), []);
});

test("グループチャットからは検討フェーズへ戻れる", () => {
  assert.deepEqual(
    getReturnablePhases("group_chat", {
      deliberation: { current_phase: "deliberation" } as never,
    }),
    ["consultation_input", "deliberation"],
  );
});

test("終了メモからは検討フェーズへ戻れる", () => {
  assert.deepEqual(
    getReturnablePhases("final_memo", {
      deliberation: { current_phase: "deliberation" } as never,
    }),
    ["consultation_input", "deliberation"],
  );
});
