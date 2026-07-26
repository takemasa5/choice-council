import assert from "node:assert/strict";
import test from "node:test";
import {
  finalMemoStatusOptions,
  resetFinalMemoStatus,
  setFinalMemoStatus,
} from "../../src/client/final-memo-flow";
import { memo } from "../../test-support/server";

test("終了状態の選択肢は仕様で定めた五つの状態を表示する", () => {
  assert.deepEqual(
    finalMemoStatusOptions.map((option) => option.status),
    [
      "tentative_conclusion",
      "pending_decision",
      "pending_research",
      "pending_family_discussion",
      "action_plan",
    ],
  );
});

test("終了状態は終了メモ生成前にメモへ反映し、失敗時は進行中へ戻す", () => {
  const finalMemo = setFinalMemoStatus(memo, "pending_research");

  assert.equal(finalMemo.status, "pending_research");
  assert.equal(resetFinalMemoStatus(finalMemo).status, "in_progress");
});
