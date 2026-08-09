import assert from "node:assert/strict";
import test from "node:test";
import {
  assignProposalIds,
  isExpertDraftEditingDisabled,
  replaceMemoInFailedFacilitatorRequest,
} from "../../src/client/facilitator-flow";
import type {
  ExpertComment,
  SessionMemo,
} from "../../src/shared/schemas/session";

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

test("並列生成した重複案IDは専門家の入力順で安定して再採番する", () => {
  const comment = (role_name: string): ExpertComment => ({
    role_name,
    viewpoint: "観点",
    summary: "要約",
    proposal: {
      id: "model-duplicate",
      name: "案",
      content: "内容",
      benefits: ["利点"],
      sacrifices: ["犠牲"],
      conditions: ["条件"],
    },
    key_point: "要点",
    concern: "懸念",
    question_to_user: "なし",
    confidence: "medium",
    needs_research: false,
  });

  const comments = assignProposalIds([comment("専門家A"), comment("専門家B")]);

  assert.deepEqual(
    comments.map((item) => item.proposal.id),
    ["proposal-1", "proposal-2"],
  );
});
