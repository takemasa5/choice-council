import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { requestGroupChatStart } from "../../src/client/group-chat-start";
import {
  createGroupChatStartRequest,
  getRetryableGroupChatStartRequest,
} from "../../src/client/hooks/use-deliberation-phase-flow";
import { createGroupChatDiscussionContext } from "../../src/client/group-chat-context";
import { DeliberationPhase } from "../../src/client/phases/DeliberationPhase";
import type {
  ExpertComment,
  GroupChatStartRequest,
} from "../../src/shared/schemas/session";

const expertComment: ExpertComment = {
  role_name: "家計アドバイザー",
  viewpoint: "費用",
  summary: "費用を確認します。",
  proposal: {
    id: "proposal-budget",
    name: "予算を守る案",
    content: "予算上限を決めて候補を絞ります。",
    benefits: ["支出を管理しやすい"],
    sacrifices: ["候補が減る"],
    conditions: ["予算上限を決める"],
  },
  key_point: "予算",
  concern: "支出",
  question_to_user: "予算はありますか。",
  confidence: "medium",
  needs_research: false,
};

type TestElement = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}>;

function collectElements(node: ReactNode): TestElement[] {
  if (Array.isArray(node)) {
    return node.flatMap(collectElements);
  }
  if (!isValidElement(node)) return [];

  const element = node as TestElement;
  return [element, ...collectElements(element.props.children)];
}

test("意見交換開始の失敗は検討画面で再試行できる", () => {
  let retryCount = 0;
  const view = DeliberationPhase({
    expertComments: [expertComment],
    discussionSelection: null,
    selectedProposalIds: [],
    isStarting: false,
    errorMessage: "",
    startErrorMessage: "意見交換の開始に失敗しました。再試行してください。",
    onStart: () => undefined,
    onRetryStart: () => {
      retryCount += 1;
    },
    onToggleProposal: () => undefined,
    onSelectDeepDive: () => undefined,
    onSelectComparison: () => undefined,
    onSelectDefer: () => undefined,
  });
  const elements = collectElements(view);
  const error = elements.find(
    (element) =>
      element.type === "p" &&
      element.props.children ===
        "意見交換の開始に失敗しました。再試行してください。",
  );
  const retryButton = elements.find(
    (element) =>
      element.type === "button" &&
      element.props.children === "意見交換の開始を再試行する",
  );

  assert.ok(error);
  assert.ok(retryButton);
  assert.ok(retryButton.props.onClick);
  retryButton.props.onClick();
  assert.equal(retryCount, 1);
});

test("案を変更した後は開始失敗の再試行操作を表示しない", () => {
  const view = DeliberationPhase({
    expertComments: [expertComment],
    discussionSelection: null,
    selectedProposalIds: [expertComment.proposal.id],
    isStarting: false,
    errorMessage: "",
    startErrorMessage: "",
    onStart: () => undefined,
    onRetryStart: () => {
      throw new Error("古いリクエストを再試行してはいけません。");
    },
    onToggleProposal: () => undefined,
    onSelectDeepDive: () => undefined,
    onSelectComparison: () => undefined,
    onSelectDefer: () => undefined,
  });

  const elements = collectElements(view);
  assert.equal(
    elements.some(
      (element) =>
        element.type === "button" &&
        element.props.children === "意見交換の開始を再試行する",
    ),
    false,
  );
});

test("案を変更した後は古い開始失敗リクエストを再試行できない", () => {
  const failedRequest: GroupChatStartRequest = {
    consultation: "相談内容",
    currentPhase: "group_chat",
    memo: {
      theme: "相談内容",
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
    },
    confirmedExperts: [
      {
        role_name: expertComment.role_name,
        viewpoint: expertComment.viewpoint,
        request: "費用を検討してください。",
        participantId: "expert-1",
      },
    ],
    initialExpertComments: [expertComment],
    discussionSelection: {
      kind: "deep_dive",
      proposalId: expertComment.proposal.id,
    },
  };

  assert.equal(getRetryableGroupChatStartRequest(failedRequest, null), null);
  assert.equal(
    getRetryableGroupChatStartRequest(failedRequest, { kind: "defer" }),
    null,
  );
});

test("案の選択は深掘り・厳密な2案比較・保留だけを開始対象にする", () => {
  let deepDiveCount = 0;
  let compareCount = 0;
  let deferCount = 0;
  const secondComment: ExpertComment = {
    ...expertComment,
    role_name: "体験アドバイザー",
    proposal: {
      ...expertComment.proposal,
      id: "proposal-experience",
      name: "体験を優先する案",
    },
  };
  const view = DeliberationPhase({
    expertComments: [expertComment, secondComment],
    discussionSelection: null,
    selectedProposalIds: ["proposal-budget", "proposal-experience"],
    isStarting: false,
    errorMessage: "",
    startErrorMessage: "",
    onStart: () => undefined,
    onRetryStart: () => undefined,
    onToggleProposal: () => undefined,
    onSelectDeepDive: () => {
      deepDiveCount += 1;
    },
    onSelectComparison: () => {
      compareCount += 1;
    },
    onSelectDefer: () => {
      deferCount += 1;
    },
  });
  const elements = collectElements(view);
  const deepDiveButton = elements.find(
    (element) =>
      element.type === "button" && element.props.children === "1案を深掘りする",
  );
  const compareButton = elements.find(
    (element) =>
      element.type === "button" && element.props.children === "2案を比較する",
  );
  const deferButton = elements.find(
    (element) =>
      element.type === "button" && element.props.children === "まだ選ばない",
  );
  const startButton = elements.find(
    (element) =>
      element.type === "button" &&
      element.props.children === "選択した内容で意見交換をはじめる",
  );

  assert.ok(deepDiveButton);
  assert.ok(compareButton);
  assert.ok(deferButton);
  assert.ok(startButton);
  assert.equal(deepDiveButton.props.disabled, true);
  assert.equal(compareButton.props.disabled, false);
  assert.equal(startButton.props.disabled, true);
  compareButton.props.onClick?.();
  deferButton.props.onClick?.();
  assert.equal(deepDiveCount, 0);
  assert.equal(compareCount, 1);
  assert.equal(deferCount, 1);
  assert.ok(elements.some((element) => element.props.children === "利点"));
  assert.ok(
    elements.some((element) => element.props.children === "犠牲にする点"),
  );
  assert.ok(elements.some((element) => element.props.children === "成立条件"));
});

test("案の選択UIは選択・無効状態と折り返し可能な操作レイアウトを示す", () => {
  const view = DeliberationPhase({
    expertComments: [
      {
        ...expertComment,
        proposal: {
          ...expertComment.proposal,
          name: "狭い画面でも案名の途中で横にはみ出さず内容を確認できるようにするための長い案名",
        },
      },
    ],
    discussionSelection: { kind: "defer" },
    selectedProposalIds: [expertComment.proposal.id],
    isStarting: true,
    errorMessage: "",
    startErrorMessage: "",
    onStart: () => undefined,
    onRetryStart: () => undefined,
    onToggleProposal: () => undefined,
    onSelectDeepDive: () => undefined,
    onSelectComparison: () => undefined,
    onSelectDefer: () => undefined,
  });

  const markup = renderToStaticMarkup(view);

  assert.match(
    markup,
    /class="expert-proposal-selection expert-proposal-selection--selected expert-proposal-selection--disabled"/,
  );
  assert.match(markup, /class="expert-actions proposal-selection-actions"/);
  assert.match(
    markup,
    /class="primary-button proposal-selection-start-button"/,
  );
});

test("意見交換開始の失敗は検討フェーズと空の会話履歴を維持して同じリクエストを再送する", async () => {
  const request: GroupChatStartRequest = {
    consultation: "相談内容",
    currentPhase: "group_chat",
    memo: {
      theme: "相談内容",
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
    },
    confirmedExperts: [
      {
        role_name: expertComment.role_name,
        viewpoint: expertComment.viewpoint,
        request: "費用を検討してください。",
        participantId: "expert-1",
      },
    ],
    initialExpertComments: [expertComment],
    discussionSelection: { kind: "defer" },
  };
  const sentRequests: GroupChatStartRequest[] = [];
  const postJson = async (
    _: string,
    sentRequest: GroupChatStartRequest,
  ): Promise<unknown> => {
    sentRequests.push(sentRequest);
    throw new Error("開始に失敗しました。");
  };

  const failed = await requestGroupChatStart(postJson, request);

  assert.equal(failed.kind, "failed");
  if (failed.kind !== "failed") return;
  assert.equal(failed.currentPhase, "deliberation");
  assert.deepEqual(failed.messages, []);
  assert.deepEqual(failed.retryRequest, request);

  await requestGroupChatStart(postJson, failed.retryRequest);
  assert.deepEqual(sentRequests, [request, request]);
});

test("意見交換開始リクエストは検討フローで参加者IDを付与して組み立てる", () => {
  const request = createGroupChatStartRequest({
    consultation: "相談内容",
    memo: {
      theme: "相談内容",
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
    },
    confirmedExperts: [
      {
        role_name: expertComment.role_name,
        viewpoint: expertComment.viewpoint,
        request: "費用を検討してください。",
      },
    ],
    expertComments: [expertComment],
    discussionSelection: { kind: "deep_dive", proposalId: "proposal-budget" },
  });

  assert.ok(request);
  assert.equal(request.confirmedExperts[0]?.participantId, "expert-1");
  assert.deepEqual(request.initialExpertComments, [expertComment]);

  const discussionContext = createGroupChatDiscussionContext(
    request.discussionSelection,
    request.initialExpertComments,
    request.confirmedExperts,
  );

  assert.deepEqual(
    discussionContext?.proposals.map((proposal) => proposal.participantId),
    request.confirmedExperts.map((expert) => expert.participantId),
  );
});
