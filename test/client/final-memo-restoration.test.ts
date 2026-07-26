import assert from "node:assert/strict";
import test from "node:test";
import { recoverInterruptedFinalMemo } from "../../src/client/final-memo-restoration";
import { memo } from "../../test-support/server";

const finalMemoResponse = {
  current_phase: "final_memo" as const,
  memo_updates: { ...memo, status: "pending_research" as const },
};

test("Markdown のない終了メモを復元すると意見交換へ戻す", () => {
  const restored = recoverInterruptedFinalMemo({
    currentPhase: "final_memo",
    response: finalMemoResponse as never,
    responseHistory: {
      group_chat: finalMemoResponse as never,
      final_memo: finalMemoResponse as never,
    },
    finalMarkdown: "",
  });

  assert.equal(restored.currentPhase, "group_chat");
  assert.equal(restored.response?.memo_updates.status, "in_progress");
  assert.equal(restored.responseHistory.final_memo, undefined);
  assert.equal(
    restored.responseHistory.group_chat?.current_phase,
    "group_chat",
  );
});

test("生成済み Markdown がある終了メモは復元時に維持する", () => {
  const restored = recoverInterruptedFinalMemo({
    currentPhase: "final_memo",
    response: finalMemoResponse as never,
    responseHistory: { final_memo: finalMemoResponse as never },
    finalMarkdown: "# 終了メモ",
  });

  assert.equal(restored.currentPhase, "final_memo");
  assert.equal(restored.responseHistory.final_memo, finalMemoResponse);
});
