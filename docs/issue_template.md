# Issue Template

## Goal

このIssueで実現する目的を記載する。

## Source Spec

- Source spec: `docs/<area>/<file>.md#<section>`
- ファイル名だけでなく、対象セクション名または見出しまで指定する。

## Acceptance Criteria

Acceptance Criteria は EARS（Easy Approach to Requirements Syntax）形式で記述する。`<システム>` には対象となる画面、API、または処理を記載する。

- [ ] 通常要件: `WHEN <トリガー> THEN <システム> SHALL <期待する応答>`
- [ ] 状態要件: `WHILE <状態> WHEN <トリガー> THEN <システム> SHALL <期待する応答>`
- [ ] 条件要件: `IF <条件> THEN <システム> SHALL <期待する応答>`
- [ ] 望ましくない事象: `WHEN <望ましくない事象> THEN <システム> SHALL <期待する応答>`
- [ ] 任意機能: `WHERE <機能または選択肢> THEN <システム> SHALL <能力>`
- [ ] 各 Acceptance Criteria を満たすことをテストコードで確認する。自動化できない場合は、理由と手動確認手順を記載する。

原則として、1〜3個のAcceptance Criteria、1つの主要モジュール、または1つの仕様セクションに収まる粒度にする。

## Out of Scope

- このIssueの Acceptance Criteria に含まれない項目
- 後続Issueで扱う仕様

## Dependencies

- 先に完了する必要があるIssueを記載する。依存がない場合は「なし」と記載する
