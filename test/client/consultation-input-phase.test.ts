import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsultationInputPhase } from "../../src/client/phases/ConsultationInputPhase";

test("通常の相談開始UIに削除済みの割り込み文言を表示しない", () => {
  const markup = renderToStaticMarkup(
    createElement(ConsultationInputPhase, {
      consultation: "",
      facts: "",
      values: "",
      concerns: "",
      expectedOutcome: "",
      isBusy: false,
      hasResponse: false,
      errorMessage: "",
      canRetry: false,
      onConsultationChange: () => undefined,
      onFactsChange: () => undefined,
      onValuesChange: () => undefined,
      onConcernsChange: () => undefined,
      onExpectedOutcomeChange: () => undefined,
      onStart: () => undefined,
      onRetry: () => undefined,
    }),
  );

  assert.match(markup, />相談を開始する<\/button>/);
  assert.doesNotMatch(markup, /ちょっと待って/);
  assert.doesNotMatch(markup, /次の区切りで止めます。/);
});
