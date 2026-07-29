import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoView } from "../../src/client/MemoView";
import type { SessionMemo } from "../../src/shared/schemas/session";

test("メモの全項目と新規の検討項目を表示する", () => {
  const memo: SessionMemo = {
    theme: "固有の相談テーマ",
    status: "in_progress",
    facts: ["固有の整理した事実"],
    values: ["固有の重視したこと"],
    concerns: ["固有の不安や懸念"],
    options: ["固有の検討した選択肢"],
    decision_axes: ["固有の判断軸"],
    expert_summaries: ["固有の専門家コメント要点"],
    conflicts: ["固有の意見が割れた点"],
    open_questions: ["固有の未確認事項"],
    next_actions: ["固有の次アクション候補"],
  };
  const expectedSections = [
    ["相談テーマ", memo.theme],
    ["整理した事実", memo.facts[0]],
    ["重視したこと", memo.values[0]],
    ["不安や懸念", memo.concerns[0]],
    ["検討した選択肢", memo.options[0]],
    ["判断軸", memo.decision_axes[0]],
    ["専門家コメントの要点", memo.expert_summaries[0]],
    ["意見が割れた点", memo.conflicts[0]],
    ["未確認事項", memo.open_questions[0]],
    ["次アクション候補", memo.next_actions[0]],
  ];

  const markup = renderToStaticMarkup(createElement(MemoView, { memo }));

  for (const [heading, value] of expectedSections) {
    assert.match(markup, new RegExp("<h3>" + heading + "</h3>"));
    assert.match(markup, new RegExp("<li>" + value + "</li>"));
  }
});
