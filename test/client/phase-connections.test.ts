import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { ConsultationInputPhaseConnection } from "../../src/client/phases/ConsultationInputPhaseConnection";
import { ConsultationInputPhase } from "../../src/client/phases/ConsultationInputPhase";
import { DeliberationPhaseConnection } from "../../src/client/phases/DeliberationPhaseConnection";
import { DeliberationPhase } from "../../src/client/phases/DeliberationPhase";
import { ExpertSelectionPhaseConnection } from "../../src/client/phases/ExpertSelectionPhaseConnection";
import { ExpertSelectionPhase } from "../../src/client/phases/ExpertSelectionPhase";
import { FinalMemoPhaseConnection } from "../../src/client/phases/FinalMemoPhaseConnection";
import { FinalMemoPhase } from "../../src/client/phases/FinalMemoPhase";
import { GroupChatPhaseConnection } from "../../src/client/phases/GroupChatPhaseConnection";
import { GroupChatPhase } from "../../src/client/phases/GroupChatPhase";
import { PremisePhaseConnection } from "../../src/client/phases/PremisePhaseConnection";
import { PremisePhase } from "../../src/client/phases/PremisePhase";
import { memo } from "../../test-support/server";

function element<Props>(node: ReactNode): ReactElement<Props> {
  assert.ok(isValidElement(node));
  return node as ReactElement<Props>;
}

const expert = {
  role_name: "家計アドバイザー",
  viewpoint: "費用",
  request: "費用を確認してください。",
};

const comment = {
  role_name: expert.role_name,
  viewpoint: expert.viewpoint,
  summary: "予算を確認します。",
  proposal: {
    id: "proposal-budget",
    name: "予算を守る案",
    content: "予算上限を決めて候補を絞ります。",
    benefits: ["支出を管理しやすい"],
    sacrifices: ["候補が減る"],
    conditions: ["予算上限を決める"],
  },
  key_point: "予算",
  concern: "追加費用",
  question_to_user: "予算上限はありますか。",
  confidence: "medium" as const,
  needs_research: false,
};

test("相談入力と前提整理の接続は無効化・エラー・再試行と主要操作を渡す", () => {
  let startInput: unknown;
  let retryCount = 0;
  const consultation = element<{
    isBusy: boolean;
    errorMessage: string;
    canRetry: boolean;
    onStart: () => void;
    onRetry: () => void;
  }>(
    ConsultationInputPhaseConnection({
      input: {
        consultation: "相談内容",
        facts: "事実",
        values: "価値観",
        concerns: "懸念",
        expectedOutcome: "期待",
        changeConsultation: () => undefined,
        changeFacts: () => undefined,
        changeValues: () => undefined,
        changeConcerns: () => undefined,
        changeExpectedOutcome: () => undefined,
      },
      isBusy: true,
      hasResponse: true,
      errorMessage: "開始に失敗しました。",
      canRetry: true,
      start: async ({ input }) => {
        startInput = input;
      },
      resetSession: () => undefined,
      applyStartedSession: () => undefined,
      retry: async () => {
        retryCount += 1;
      },
    }),
  );

  assert.equal(consultation.type, ConsultationInputPhase);
  assert.equal(consultation.props.isBusy, true);
  assert.equal(consultation.props.errorMessage, "開始に失敗しました。");
  assert.equal(consultation.props.canRetry, true);
  consultation.props.onStart();
  consultation.props.onRetry();
  assert.deepEqual(startInput, {
    consultation: "相談内容",
    facts: "事実",
    values: "価値観",
    concerns: "懸念",
    expectedOutcome: "期待",
  });
  assert.equal(retryCount, 1);

  let submitted = 0;
  const premise = element<{
    isBusy: boolean;
    errorMessage: string;
    canRetry: boolean;
    onSubmitAnswer: () => void;
  }>(
    PremisePhaseConnection({
      response: {
        current_phase: "premise",
        user_question: {
          question: "質問",
          options: ["はい", "その他"],
          required: true,
        },
        memo_updates: memo,
        next_action: "wait_user",
        expert_requests: [],
      } as never,
      isBusy: true,
      selectedOption: "はい",
      otherAnswer: "",
      errorMessage: "回答に失敗しました。",
      canRetry: true,
      selectOption: () => undefined,
      changeOtherAnswer: () => undefined,
      submitAnswer: async () => {
        submitted += 1;
      },
      proceedToExpertSelection: () => undefined,
      retry: async () => undefined,
    }),
  );

  assert.equal(premise.type, PremisePhase);
  assert.equal(premise.props.isBusy, true);
  assert.equal(premise.props.errorMessage, "回答に失敗しました。");
  assert.equal(premise.props.canRetry, true);
  premise.props.onSubmitAnswer();
  assert.equal(submitted, 1);
});

test("専門家選定と検討の接続は表示状態と開始操作を渡す", () => {
  let generated = 0;
  const selection = element<{
    isDisabled: boolean;
    isGenerating: boolean;
    errorMessage: string;
    onGenerate: () => void;
  }>(
    ExpertSelectionPhaseConnection({
      response: { expert_requests: [expert] } as never,
      expertDrafts: [{ ...expert, draftId: "expert-draft-1" }],
      confirmedExperts: [expert],
      isDisabled: true,
      isGenerating: true,
      errorMessage: "専門家コメントの生成に失敗しました。",
      updateExpertDraft: () => undefined,
      addExpertDraft: () => undefined,
      removeExpertDraft: () => undefined,
      replaceExpertDraft: () => undefined,
      confirmInitialDrafts: () => undefined,
      confirmDrafts: () => undefined,
      generateComments: async () => {
        generated += 1;
      },
    }),
  );

  assert.equal(selection.type, ExpertSelectionPhase);
  assert.equal(selection.props.isDisabled, true);
  assert.equal(selection.props.isGenerating, true);
  assert.equal(
    selection.props.errorMessage,
    "専門家コメントの生成に失敗しました。",
  );
  selection.props.onGenerate();
  assert.equal(generated, 1);

  let startInput: unknown;
  const deliberation = element<{
    isStarting: boolean;
    errorMessage: string;
    startErrorMessage: string;
    onStart: () => void;
  }>(
    DeliberationPhaseConnection({
      consultation: "相談内容",
      memo,
      confirmedExperts: [expert],
      expertComments: [comment],
      discussionSelection: { kind: "deep_dive", proposalId: "proposal-budget" },
      selectedProposalIds: ["proposal-budget"],
      isStarting: true,
      expertErrorMessage: "コメントを確認してください。",
      startErrorMessage: "意見交換の開始に失敗しました。",
      toggleProposal: () => undefined,
      selectDeepDive: () => undefined,
      selectComparison: () => undefined,
      selectDefer: () => undefined,
      start: async (input) => {
        startInput = input;
      },
      retryStart: async () => undefined,
    }),
  );

  assert.equal(deliberation.type, DeliberationPhase);
  assert.equal(deliberation.props.isStarting, true);
  assert.equal(deliberation.props.errorMessage, "コメントを確認してください。");
  assert.equal(
    deliberation.props.startErrorMessage,
    "意見交換の開始に失敗しました。",
  );
  deliberation.props.onStart();
  assert.deepEqual(startInput, {
    consultation: "相談内容",
    memo,
    confirmedExperts: [expert],
    expertComments: [comment],
    discussionSelection: { kind: "deep_dive", proposalId: "proposal-budget" },
  });
});

test("意見交換と終了メモの接続はエラー・再試行・終了操作を渡す", () => {
  let submitted: unknown;
  let retried = 0;
  let finished: unknown;
  const messages = [
    {
      id: "message-1",
      speakerType: "facilitator" as const,
      speakerName: "ファシリテーター",
      participantId: "facilitator",
      content: "質問です。",
      createdAt: "2026-07-31T00:00:00.000Z",
    },
  ];
  const groupChat = element<{
    isLoading: boolean;
    isNextTurnRetryPending: boolean;
    errorMessage: string;
    finishErrorMessage: string;
    onUserAnswer: (answer: string) => void;
    onRetryExpertReply: () => void;
    onFinish: (status: "tentative_conclusion") => void;
  }>(
    GroupChatPhaseConnection({
      turn: null,
      messages,
      otherAnswer: "",
      isLoading: true,
      isNextTurnRetryPending: true,
      errorMessage: "回答の送信に失敗しました。",
      context: {
        consultation: "相談内容",
        memo,
        confirmedExperts: [expert],
        discussionSelection: { kind: "defer" },
        expertComments: [comment],
      },
      expertComments: [comment],
      contextSummary: "要約",
      finishErrorMessage: "終了メモの生成に失敗しました。",
      changeOtherAnswer: () => undefined,
      submitUserAnswer: async (input) => {
        submitted = input;
      },
      retryExpertReply: async () => {
        retried += 1;
      },
      retryNextTurn: async () => {
        retried += 1;
      },
      finish: async (input) => {
        finished = input;
      },
    }),
  );

  assert.equal(groupChat.type, GroupChatPhase);
  assert.equal(groupChat.props.isLoading, true);
  assert.equal(groupChat.props.isNextTurnRetryPending, true);
  assert.equal(groupChat.props.errorMessage, "回答の送信に失敗しました。");
  assert.equal(
    groupChat.props.finishErrorMessage,
    "終了メモの生成に失敗しました。",
  );
  groupChat.props.onUserAnswer("回答");
  groupChat.props.onRetryExpertReply();
  groupChat.props.onFinish("tentative_conclusion");
  assert.deepEqual(submitted, {
    consultation: "相談内容",
    memo,
    confirmedExperts: [expert],
    discussionSelection: { kind: "defer" },
    expertComments: [comment],
    answer: "回答",
  });
  assert.equal(retried, 1);
  assert.deepEqual(finished, {
    consultation: "相談内容",
    memo,
    status: "tentative_conclusion",
    expertComments: [comment],
    contextSummary: "要約",
    recentMessages: messages,
  });

  const finalMemo = element<{
    isGenerating: boolean;
    finalMarkdown: string;
  }>(
    FinalMemoPhaseConnection({
      isVisible: true,
      isGenerating: true,
      finalMarkdown: "# 終了メモ",
      download: () => undefined,
    }),
  );
  assert.equal(finalMemo.type, FinalMemoPhase);
  assert.equal(finalMemo.props.isGenerating, true);
  assert.equal(finalMemo.props.finalMarkdown, "# 終了メモ");
  assert.equal(
    FinalMemoPhaseConnection({
      isVisible: false,
      isGenerating: false,
      finalMarkdown: "",
      download: () => undefined,
    }),
    null,
  );
});
