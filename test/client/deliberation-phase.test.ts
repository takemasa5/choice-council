import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { requestGroupChatStart } from "../../src/client/group-chat-start";
import { createGroupChatStartRequest } from "../../src/client/hooks/use-deliberation-phase-flow";
import { DeliberationPhase } from "../../src/client/phases/DeliberationPhase";
import type {
  ExpertComment,
  GroupChatStartRequest,
} from "../../src/shared/schemas/session";

const expertComment: ExpertComment = {
  role_name: "家計アドバイザー",
  viewpoint: "費用",
  summary: "費用を確認します。",
  key_point: "予算",
  concern: "支出",
  question_to_user: "予算はありますか。",
  confidence: "medium",
  needs_research: false,
};

type TestElement = ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
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
    isStarting: false,
    errorMessage: "",
    startErrorMessage: "意見交換の開始に失敗しました。再試行してください。",
    onStart: () => undefined,
    onRetryStart: () => {
      retryCount += 1;
    },
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
  });

  assert.ok(request);
  assert.equal(request.confirmedExperts[0]?.participantId, "expert-1");
  assert.deepEqual(request.initialExpertComments, [expertComment]);
});
