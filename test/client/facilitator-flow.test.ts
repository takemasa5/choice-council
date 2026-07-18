import assert from "node:assert/strict";
import test from "node:test";
import {
  isExpertDraftEditingDisabled,
  replaceMemoInFailedFacilitatorRequest,
} from "../../src/client/facilitator-flow";
import type { SessionMemo } from "../../src/shared/schemas/session";

const memo: SessionMemo = {
  theme: "相談",
  status: "in_progress",
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

test("専門家コメント生成中だけ候補編集を無効化する", () => {
  assert.equal(isExpertDraftEditingDisabled(true), true);
  assert.equal(isExpertDraftEditingDisabled(false), false);
});

test("確認回答のリトライには最新メモを保持する", () => {
  const updated = { ...memo, next_actions: ["確認する"] };
  assert.deepEqual(
    replaceMemoInFailedFacilitatorRequest(
      {
        endpoint: "respond",
        request: {
          consultation: "相談",
          currentPhase: "premise",
          memo,
          userQuestion: {
            question: "質問",
            options: ["A", "その他"],
            required: true,
          },
          userQuestionAnswer: "A",
        },
      },
      updated,
    ),
    {
      endpoint: "respond",
      request: {
        consultation: "相談",
        currentPhase: "premise",
        memo: updated,
        userQuestion: {
          question: "質問",
          options: ["A", "その他"],
          required: true,
        },
        userQuestionAnswer: "A",
      },
    },
  );
});
