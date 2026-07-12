# Issue Template

## Goal

このIssueで実現する目的を記載する。

## Source Spec

- Source spec: `docs/<area>/<file>.md#<section>`
- ファイル名だけでなく、対象セクション名または見出しまで指定する。

## Phase Handoff

- Applicable: Yes / No
- Source:
  - 申し送り事項に関連するIssueの場合は `docs/tasks/open-questions.md#<section>` のように参照を書く
- Summary:
  - `Applicable: Yes` の場合は、申し送り事項を要約して記載する。
  - `Applicable: No` の場合は「申し送り事項に関連しない」と記載する。

## Acceptance Criteria

- [ ] 外部から確認できる完了条件を記載する
- [ ] 異常系または境界条件を記載する
- [ ] 必要に応じて関連する `docs/` 配下の仕様と整合していることを確認する

原則として、1〜3個のAcceptance Criteria、1つの主要モジュール、または1つの仕様セクションに収まる粒度にする。

## Out of Scope

- 同じマイルストーン内でも、このIssueのAcceptance Criteriaに含まれない項目
- 後続Issueで扱う仕様

## Dependencies

- 先に完了する必要があるIssueを記載する。依存がない場合は「なし」と記載する
