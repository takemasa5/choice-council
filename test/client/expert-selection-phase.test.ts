import assert from "node:assert/strict";
import test from "node:test";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  shouldPreserveRestoredExpertDrafts,
  useExpertSelectionPhase,
} from "../../src/client/hooks/use-expert-selection-phase";

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
