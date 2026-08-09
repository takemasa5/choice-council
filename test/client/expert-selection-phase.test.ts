import assert from "node:assert/strict";
import test from "node:test";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  shouldPreserveRestoredExpertDrafts,
  useExpertSelectionPhase,
} from "../../src/client/hooks/use-expert-selection-phase";
import type {
  ExpertComment,
  ExpertRequest,
  SessionMemo,
} from "../../src/shared/schemas/session";

test("復元済みresponseと同じ候補キーなら編集済みdraftを維持する", () => {
  assert.equal(
    shouldPreserveRestoredExpertDrafts(
      '[{"role_name":"家計アドバイザー"}]',
      '[{"role_name":"家計アドバイザー"}]',
    ),
    true,
  );
});

test("候補キーが異なるなら新しいファシリテーター候補へ同期する", () => {
  assert.equal(
    shouldPreserveRestoredExpertDrafts(
      '[{"role_name":"家計アドバイザー"}]',
      '[{"role_name":"法律アドバイザー"}]',
    ),
    false,
  );
});

test("復元キーがない旧セッションは新しい候補へ同期する", () => {
  assert.equal(
    shouldPreserveRestoredExpertDrafts(
      null,
      '[{"role_name":"家計アドバイザー"}]',
    ),
    false,
  );
});

test("専門家選定へ戻った後も編集済みdraftを候補同期で維持する", () => {
  const candidate = {
    role_name: "家計アドバイザー",
    viewpoint: "予算",
    request: "費用を整理してください",
  };
  const editedDraft = {
    ...candidate,
    viewpoint: "予算と家族の満足度",
    draftId: "expert-draft-3",
  };
  const candidateKey = JSON.stringify([candidate]);
  let restoredDrafts: (typeof editedDraft)[] = [];
  let restoredProvenance: string | null = null;

  function HookHarness() {
    const selection = useExpertSelectionPhase({
      getContext: () => ({
        consultation: "相談内容",
        currentPhase: "expert_selection" as const,
        memo: null,
      }),
      getRequiredQuestionMessage: () => "",
      isInteractionDisabled: () => false,
      onConfirmed: () => undefined,
      onGenerationStarted: () => undefined,
      onCommentsGenerated: () => undefined,
    });
    const [step, setStep] = useState(0);

    if (step === 0) {
      selection.restoreForPhase({
        initialCandidates: [candidate],
        confirmedCandidates: [],
        comments: [],
        drafts: [editedDraft],
        draftProvenanceKey: candidateKey,
      });
      setStep(1);
    } else if (step === 1) {
      selection.synchronizeCandidates([candidate], candidateKey);
      setStep(2);
    } else {
      restoredDrafts = selection.expertDrafts;
      restoredProvenance = selection.expertDraftProvenanceKey;
    }

    return null;
  }

  renderToStaticMarkup(createElement(HookHarness));

  assert.deepEqual(restoredDrafts, [editedDraft]);
  assert.equal(restoredProvenance, candidateKey);
});

test("熟議を経由して専門家選定へ戻っても編集済みdraftを維持する", () => {
  const candidate = {
    role_name: "家計アドバイザー",
    viewpoint: "予算",
    request: "費用を整理してください",
  };
  const editedDraft = {
    ...candidate,
    viewpoint: "予算と家族の満足度",
    draftId: "expert-draft-3",
  };
  const candidateKey = JSON.stringify([candidate]);
  let restoredDrafts: (typeof editedDraft)[] = [];
  let restoredProvenance: string | null = null;

  function HookHarness() {
    const selection = useExpertSelectionPhase({
      getContext: () => ({
        consultation: "相談内容",
        currentPhase: "expert_selection" as const,
        memo: null,
      }),
      getRequiredQuestionMessage: () => "",
      isInteractionDisabled: () => false,
      onConfirmed: () => undefined,
      onGenerationStarted: () => undefined,
      onCommentsGenerated: () => undefined,
    });
    const [step, setStep] = useState(0);

    if (step === 0 || step === 1) {
      selection.restoreForPhase({
        initialCandidates: step === 0 ? [candidate] : [],
        confirmedCandidates: [],
        comments: [],
        drafts: [editedDraft],
        draftProvenanceKey: candidateKey,
      });
      setStep(step + 1);
    } else if (step === 2) {
      selection.synchronizeCandidates([candidate], candidateKey);
      setStep(3);
    } else {
      restoredDrafts = selection.expertDrafts;
      restoredProvenance = selection.expertDraftProvenanceKey;
    }

    return null;
  }

  renderToStaticMarkup(createElement(HookHarness));

  assert.deepEqual(restoredDrafts, [editedDraft]);
  assert.equal(restoredProvenance, candidateKey);
});

test("検討から専門家選定へ戻った後、同じ候補でこのまま進めるとコメントを再生成する", async () => {
  const expert: ExpertRequest = {
    role_name: "家計アドバイザー",
    viewpoint: "予算",
    request: "費用を整理してください",
  };
  const returnedDraft = {
    ...expert,
    role_name: " 家計アドバイザー ",
    viewpoint: " 予算 ",
    request: " 費用を整理してください ",
  };
  const expertComment: ExpertComment = {
    role_name: expert.role_name,
    viewpoint: expert.viewpoint,
    summary: "予算上限を先に決めるべきです。",
    proposal: {
      id: "proposal-budget",
      name: "予算を守る案",
      content: "予算上限を決めて候補を絞ります。",
      benefits: ["支出を管理しやすい"],
      sacrifices: ["候補が減る"],
      conditions: ["予算上限を決める"],
    },
    key_point: "予算上限",
    concern: "追加費用が不明です。",
    question_to_user: "なし",
    confidence: "medium",
    needs_research: false,
  };
  const updatedMemo: SessionMemo = {
    theme: "家族旅行",
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
  const originalFetch = globalThis.fetch;
  const requestedPaths: string[] = [];
  const confirmed: ExpertRequest[][] = [];
  let completedMemo: SessionMemo | null = null;
  let generation: Promise<void> | void = undefined;

  globalThis.fetch = async (input) => {
    requestedPaths.push(String(input));
    if (String(input) === "/api/expert/comment") {
      return new Response(JSON.stringify(expertComment), { status: 200 });
    }
    if (String(input) === "/api/session-memo/update") {
      return new Response(JSON.stringify(updatedMemo), { status: 200 });
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  };

  try {
    function HookHarness() {
      const selection = useExpertSelectionPhase({
        getContext: () => ({
          consultation: "相談内容",
          currentPhase: "expert_selection" as const,
          memo: null,
        }),
        getRequiredQuestionMessage: () => "",
        isInteractionDisabled: () => false,
        onConfirmed: (experts) => confirmed.push(experts),
        onGenerationStarted: () => undefined,
        onCommentsGenerated: (memo) => {
          completedMemo = memo;
        },
      });
      const [step, setStep] = useState(0);

      if (step === 0) {
        selection.restoreForPhase({
          initialCandidates: [expert],
          confirmedCandidates: [expert],
          comments: [],
          drafts: [{ ...returnedDraft, draftId: "expert-draft-1" }],
          draftProvenanceKey: JSON.stringify([expert]),
        });
        setStep(1);
      } else if (step === 1) {
        generation = selection.confirmDrafts();
        setStep(2);
      }

      return null;
    }

    renderToStaticMarkup(createElement(HookHarness));
    await generation;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(confirmed, [[expert]]);
  assert.deepEqual(requestedPaths, [
    "/api/expert/comment",
    "/api/session-memo/update",
  ]);
  assert.deepEqual(completedMemo, updatedMemo);
});

test("戻った後に候補を編集して元へ戻した場合はコメントを自動再生成しない", () => {
  const expert: ExpertRequest = {
    role_name: "家計アドバイザー",
    viewpoint: "予算",
    request: "費用を整理してください",
  };
  const originalFetch = globalThis.fetch;
  const requestedPaths: string[] = [];
  const confirmed: ExpertRequest[][] = [];
  let confirmedAfterEdit: ExpertRequest[] = [];

  globalThis.fetch = async (input) => {
    requestedPaths.push(String(input));
    return new Response(JSON.stringify({}), { status: 500 });
  };

  try {
    function HookHarness() {
      const selection = useExpertSelectionPhase({
        getContext: () => ({
          consultation: "相談内容",
          currentPhase: "expert_selection" as const,
          memo: null,
        }),
        getRequiredQuestionMessage: () => "",
        isInteractionDisabled: () => false,
        onConfirmed: (experts) => confirmed.push(experts),
        onGenerationStarted: () => undefined,
        onCommentsGenerated: () => undefined,
      });
      const [step, setStep] = useState(0);

      if (step === 0) {
        selection.restoreForPhase({
          initialCandidates: [expert],
          confirmedCandidates: [expert],
          comments: [],
          drafts: [{ ...expert, draftId: "expert-draft-1" }],
          draftProvenanceKey: JSON.stringify([expert]),
        });
        setStep(1);
      } else if (step === 1) {
        selection.updateExpertDraft(0, "viewpoint", "家族の満足度");
        setStep(2);
      } else if (step === 2) {
        selection.updateExpertDraft(0, "viewpoint", expert.viewpoint);
        setStep(3);
      } else if (step === 3) {
        selection.confirmDrafts();
        setStep(4);
      } else {
        confirmedAfterEdit = selection.confirmedExperts;
      }

      return null;
    }

    renderToStaticMarkup(createElement(HookHarness));
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestedPaths, []);
  assert.deepEqual(confirmed, [[expert]]);
  assert.deepEqual(confirmedAfterEdit, [expert]);
});

test("前提整理へ戻った後は新しい候補からdraftを同期する", () => {
  const previousCandidate = {
    role_name: "家計アドバイザー",
    viewpoint: "予算",
    request: "費用を整理してください",
  };
  const editedDraft = {
    ...previousCandidate,
    viewpoint: "予算と家族の満足度",
    draftId: "expert-draft-3",
  };
  const nextCandidate = {
    role_name: "法律アドバイザー",
    viewpoint: "契約",
    request: "契約条件を確認してください",
  };
  const previousCandidateKey = JSON.stringify([previousCandidate]);
  const nextCandidateKey = JSON.stringify([nextCandidate]);
  let restoredDrafts: (typeof editedDraft)[] = [];
  let restoredProvenance: string | null = null;

  function HookHarness() {
    const selection = useExpertSelectionPhase({
      getContext: () => ({
        consultation: "相談内容",
        currentPhase: "expert_selection" as const,
        memo: null,
      }),
      getRequiredQuestionMessage: () => "",
      isInteractionDisabled: () => false,
      onConfirmed: () => undefined,
      onGenerationStarted: () => undefined,
      onCommentsGenerated: () => undefined,
    });
    const [step, setStep] = useState(0);

    if (step === 0) {
      selection.restoreForPhase({
        initialCandidates: [previousCandidate],
        confirmedCandidates: [],
        comments: [],
        drafts: [editedDraft],
        draftProvenanceKey: previousCandidateKey,
      });
      setStep(1);
    } else if (step === 1) {
      selection.restoreForPhase({
        initialCandidates: [],
        confirmedCandidates: [],
        comments: [],
      });
      setStep(2);
    } else if (step === 2) {
      selection.synchronizeCandidates([nextCandidate], nextCandidateKey);
      setStep(3);
    } else {
      restoredDrafts = selection.expertDrafts;
      restoredProvenance = selection.expertDraftProvenanceKey;
    }

    return null;
  }

  renderToStaticMarkup(createElement(HookHarness));

  assert.deepEqual(restoredDrafts, [
    { ...nextCandidate, draftId: "expert-draft-1" },
  ]);
  assert.equal(restoredProvenance, nextCandidateKey);
});

test("全専門家コメントの成功後に更新済みメモを渡して検討へ進める", async () => {
  const expert: ExpertRequest = {
    role_name: "家計アドバイザー",
    viewpoint: "予算",
    request: "費用を整理してください",
  };
  const expertComment: ExpertComment = {
    role_name: expert.role_name,
    viewpoint: expert.viewpoint,
    summary: "予算上限を先に決めるべきです。",
    proposal: {
      id: "proposal-budget",
      name: "予算を守る案",
      content: "予算上限を決めて候補を絞ります。",
      benefits: ["支出を管理しやすい"],
      sacrifices: ["候補が減る"],
      conditions: ["予算上限を決める"],
    },
    key_point: "予算上限",
    concern: "追加費用が不明です。",
    question_to_user: "なし",
    confidence: "medium",
    needs_research: false,
  };
  const previousMemo: SessionMemo = {
    theme: "家族旅行",
    status: "in_progress",
    facts: ["予算は10万円です。"],
    values: [],
    concerns: [],
    options: [],
    decision_axes: [],
    expert_summaries: [],
    conflicts: [],
    open_questions: [],
    next_actions: [],
  };
  const updatedMemo: SessionMemo = {
    ...previousMemo,
    expert_summaries: ["家計アドバイザー: 予算上限を先に決める。"],
  };
  const requests: { path: string; body: unknown }[] = [];
  const originalFetch = globalThis.fetch;
  let receivedMemo: SessionMemo | null = null;
  let generation: Promise<void> | null = null;

  globalThis.fetch = async (input, init) => {
    const path = String(input);
    requests.push({ path, body: JSON.parse(String(init?.body)) });
    if (path === "/api/expert/comment") {
      return new Response(JSON.stringify(expertComment), { status: 200 });
    }
    if (path === "/api/session-memo/update") {
      return new Response(JSON.stringify(updatedMemo), { status: 200 });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  try {
    function HookHarness() {
      const selection = useExpertSelectionPhase({
        getContext: () => ({
          consultation: "相談内容",
          currentPhase: "expert_selection" as const,
          memo: previousMemo,
        }),
        getRequiredQuestionMessage: () => "",
        isInteractionDisabled: () => false,
        onConfirmed: () => undefined,
        onGenerationStarted: () => undefined,
        onCommentsGenerated: (memo) => {
          receivedMemo = memo;
        },
      });
      const [isPrepared, setIsPrepared] = useState(false);

      if (!isPrepared) {
        selection.restoreSelection({
          initialCandidates: [],
          confirmedCandidates: [expert],
          comments: [],
        });
        setIsPrepared(true);
      } else if (!generation) {
        generation = selection.generateComments();
      }

      return null;
    }

    renderToStaticMarkup(createElement(HookHarness));
    await generation;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    {
      path: "/api/expert/comment",
      body: {
        consultation: "相談内容",
        currentPhase: "deliberation",
        memo: previousMemo,
        expert,
      },
    },
    {
      path: "/api/session-memo/update",
      body: {
        consultation: "相談内容",
        currentPhase: "expert_selection",
        previousMemo,
        expertComments: [
          {
            ...expertComment,
            proposal: { ...expertComment.proposal, id: "proposal-1" },
          },
        ],
      },
    },
  ]);
  assert.deepEqual(receivedMemo, updatedMemo);
});

test("メモ更新が失敗した場合は検討へ進めない", async () => {
  const expert: ExpertRequest = {
    role_name: "家計アドバイザー",
    viewpoint: "予算",
    request: "費用を整理してください",
  };
  const expertComment: ExpertComment = {
    role_name: expert.role_name,
    viewpoint: expert.viewpoint,
    summary: "予算上限を先に決めるべきです。",
    proposal: {
      id: "proposal-budget",
      name: "予算を守る案",
      content: "予算上限を決めて候補を絞ります。",
      benefits: ["支出を管理しやすい"],
      sacrifices: ["候補が減る"],
      conditions: ["予算上限を決める"],
    },
    key_point: "予算上限",
    concern: "追加費用が不明です。",
    question_to_user: "なし",
    confidence: "medium",
    needs_research: false,
  };
  const originalFetch = globalThis.fetch;
  let commentsGenerated = false;
  let generation: Promise<void> | null = null;

  globalThis.fetch = async (input) => {
    if (String(input) === "/api/expert/comment") {
      return new Response(JSON.stringify(expertComment), { status: 200 });
    }
    return new Response(JSON.stringify({ theme: "不正な応答" }), {
      status: 200,
    });
  };

  try {
    function HookHarness() {
      const selection = useExpertSelectionPhase({
        getContext: () => ({
          consultation: "相談内容",
          currentPhase: "expert_selection" as const,
          memo: null,
        }),
        getRequiredQuestionMessage: () => "",
        isInteractionDisabled: () => false,
        onConfirmed: () => undefined,
        onGenerationStarted: () => undefined,
        onCommentsGenerated: () => {
          commentsGenerated = true;
        },
      });
      const [isPrepared, setIsPrepared] = useState(false);

      if (!isPrepared) {
        selection.restoreSelection({
          initialCandidates: [],
          confirmedCandidates: [expert],
          comments: [],
        });
        setIsPrepared(true);
      } else if (!generation) {
        generation = selection.generateComments();
      }

      return null;
    }

    renderToStaticMarkup(createElement(HookHarness));
    await generation;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(commentsGenerated, false);
});
