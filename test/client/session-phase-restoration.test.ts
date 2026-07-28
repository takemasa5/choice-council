import assert from "node:assert/strict";
import test from "node:test";
import { restoreSessionPhase } from "../../src/client/session-phase-restoration";

test("初回専門家コメントの旧directionフェーズから意見交換開始を再開する", () => {
  assert.equal(
    restoreSessionPhase("direction", "deliberation"),
    "deliberation",
  );
});

test("保存済みフェーズがない場合はresponse側の有効フェーズを使う", () => {
  assert.equal(restoreSessionPhase(undefined, "group_chat"), "group_chat");
});

test("未知のフェーズはconsultation_inputへフォールバックする", () => {
  assert.equal(
    restoreSessionPhase("retired_phase", "group_chat"),
    "consultation_input",
  );
});

test("現行の有効フェーズを維持する", () => {
  assert.equal(restoreSessionPhase("final_memo", "group_chat"), "final_memo");
});
