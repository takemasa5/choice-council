import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PhaseContent,
  selectPhaseContent,
} from "../../src/client/phases/PhaseContent";
import { GroupChatPhase } from "../../src/client/phases/GroupChatPhase";
import type {
  FacilitatorTurn,
  GroupChatMessage,
  Phase,
} from "../../src/shared/schemas/session";

const phases: Phase[] = [
  "consultation_input",
  "premise",
  "expert_selection",
  "deliberation",
  "group_chat",
  "final_memo",
];

test("現在フェーズに対応するUIは PhaseContent の唯一の分岐で選ばれる", () => {
  const content = Object.fromEntries(
    phases.map((phase) => [phase, `${phase}-content`]),
  ) as Record<Phase, string>;

  for (const phase of phases) {
    assert.equal(selectPhaseContent(phase, content), `${phase}-content`);
  }
});

test("検討中は相談入力UIではなく検討UIだけを描画する", () => {
  const content = Object.fromEntries(
    phases.map((phase) => [
      phase,
      createElement("section", { "data-phase": phase }, `${phase}-content`),
    ]),
  ) as Record<Phase, ReactNode>;

  const markup = renderToStaticMarkup(
    createElement(PhaseContent, {
      currentPhase: "deliberation",
      content,
      renderResponse: (phaseContent) =>
        createElement("article", { "data-role": "response" }, phaseContent),
    }),
  );

  assert.match(markup, /data-phase="deliberation"/);
  assert.doesNotMatch(markup, /data-phase="consultation_input"/);
});

test("意見交換は発言者の役割に応じたカードと現在のファシリテーター質問を表示する", () => {
  const turn: FacilitatorTurn = {
    message: "優先順位を確認します。",
    requestedSpeaker: {
      speakerType: "user",
      participantId: "user",
      speakerName: "あなた",
    },
    requestReason: "判断基準を明確にするためです。",
    question: "何を優先しますか？",
    userOptions: [
      "費用を優先して進めたい",
      "そのまま意見交換を続けて",
    ],
    memoUpdate: null,
    contextSummaryUpdate: null,
  };
  const messages: GroupChatMessage[] = [
    {
      id: "facilitator-1",
      speakerType: "facilitator",
      speakerName: "進行役",
      participantId: "facilitator",
      content: "論点を整理します。",
      createdAt: "2026-07-27T00:00:00.000Z",
    },
    {
      id: "expert-1",
      speakerType: "expert",
      speakerName: "家計アドバイザー",
      participantId: "expert-household-a",
      content: "予算を確認しましょう。",
      createdAt: "2026-07-27T00:01:00.000Z",
    },
    {
      id: "expert-2",
      speakerType: "expert",
      speakerName: "家計アドバイザー",
      participantId: "expert-household-b",
      content: "固定費も確認しましょう。",
      createdAt: "2026-07-27T00:01:30.000Z",
    },
    {
      id: "expert-3",
      speakerType: "expert",
      speakerName: "家計アドバイザー",
      participantId: "expert-household-a",
      content: "支出の上限も確認しましょう。",
      createdAt: "2026-07-27T00:01:45.000Z",
    },
    {
      id: "user-1",
      speakerType: "user",
      speakerName: "あなた",
      participantId: "user",
      content: "費用を優先します。",
      createdAt: "2026-07-27T00:02:00.000Z",
    },
  ];

  const markup = renderToStaticMarkup(
    createElement(GroupChatPhase, {
      turn,
      messages,
      otherAnswer: "",
      isLoading: false,
      errorMessage: "",
      onOtherAnswerChange: () => undefined,
      onUserAnswer: () => undefined,
      onRetryExpertReply: () => undefined,
      finishErrorMessage: "",
      onFinish: () => undefined,
    }),
  );

  assert.match(
    markup,
    /class="group-chat-message group-chat-message--facilitator"[\s\S]*?<span class="group-chat-avatar group-chat-avatar--facilitator" aria-hidden="true">司<\/span>/,
  );
  assert.match(
    markup,
    /class="group-chat-message group-chat-message--facilitator"[\s\S]*?<strong>ファシリテーター<\/strong>/,
  );
  const expertAvatars = [
    ...markup.matchAll(
      /<span class="expert-avatar" aria-label="([^"]+)" role="img" style="--expert-avatar-hue:(\d+)"><span aria-hidden="true">家計<\/span><span class="expert-avatar-number" aria-hidden="true">(\d+)<\/span><\/span>/g,
    ),
  ];
  assert.equal(expertAvatars.length, 3);
  assert.deepEqual(
    expertAvatars.map((match) => match[1]),
    [
      "家計アドバイザー、専門家1番",
      "家計アドバイザー、専門家2番",
      "家計アドバイザー、専門家1番",
    ],
  );
  assert.deepEqual(
    expertAvatars.map((match) => match[3]),
    ["1", "2", "1"],
  );
  assert.equal(expertAvatars[0][2], expertAvatars[2][2]);
  assert.match(
    markup,
    /class="group-chat-message group-chat-message--expert"[\s\S]*?<strong>家計アドバイザー<\/strong>/,
  );
  assert.match(
    markup,
    /class="group-chat-message group-chat-message--user"[\s\S]*?<span class="group-chat-message-label">あなた<\/span>[\s\S]*?<span class="group-chat-avatar group-chat-avatar--user" aria-hidden="true">あ<\/span>/,
  );
  assert.match(
    markup,
    /class="group-chat-message group-chat-message--facilitator group-chat-question"[\s\S]*?<span class="group-chat-avatar group-chat-avatar--facilitator" aria-hidden="true">司<\/span>[\s\S]*?<strong>ファシリテーター<\/strong>[\s\S]*?<span class="group-chat-question-label">質問<\/span>何を優先しますか？/,
  );
  assert.match(markup, /class="group-chat-answer-controls"/);
  assert.match(markup, /class="group-chat-option-grid"/);
  assert.match(markup, />費用を優先して進めたい<\/button>/);
  assert.match(markup, />そのまま意見交換を続けて<\/button>/);
  assert.match(markup, /<textarea rows="3"><\/textarea>/);
  assert.match(
    markup,
    /<button class="primary-button" type="button" disabled="">回答を送る<\/button>/,
  );
  assert.doesNotMatch(markup, /その他/);
  assert.doesNotMatch(markup, /<strong>進行役<\/strong>/);
  assert.doesNotMatch(markup, /<strong>専門家<\/strong>/);
});
