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
