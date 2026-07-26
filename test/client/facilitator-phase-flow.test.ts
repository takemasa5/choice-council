import assert from "node:assert/strict";
import test from "node:test";
import { getFacilitatorRetryTransport } from "../../src/client/hooks/use-facilitator-phase-flow";
import {
  replaceMemoInFailedFacilitatorRequest,
  type FailedFacilitatorRequest,
} from "../../src/client/facilitator-flow";

test("メモ更新後の前提整理リトライは最新メモを送る", () => {
  const originalMemo = createMemo("開始時メモ");
  const updatedMemo = createMemo("更新後メモ");
  const failedRequest: FailedFacilitatorRequest = {
    endpoint: "respond",
    request: {
      consultation: "相談内容",
      currentPhase: "premise",
      userQuestion: {
        question: "重視することは何ですか。",
        options: ["安心", "その他"],
        required: true,
      },
      userQuestionAnswer: "安心",
      memo: originalMemo,
    },
  };

  const synchronized = replaceMemoInFailedFacilitatorRequest(
    failedRequest,
    updatedMemo,
  );
  assert.ok(synchronized);
  if (synchronized.endpoint !== "respond") return;

  const retry = getFacilitatorRetryTransport(synchronized);

  assert.equal(retry.path, "/api/facilitator/respond");
  assert.deepEqual(retry.request.memo, updatedMemo);
});

function createMemo(theme: string) {
  return {
    theme,
    status: "in_progress" as const,
    facts: [],
    values: [],
    concerns: [],
    options: [],
    decision_axes: [],
    expert_summaries: [],
    conflicts: [],
    open_questions: [],
    next_actions: [],
  };
}
