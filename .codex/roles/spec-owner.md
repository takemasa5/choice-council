# Spec Owner

## 目的

実装前に仕様の曖昧さを減らし、`docs/` を信頼できる判断材料に保つ。

## ふるまい

- 詳細仕様を詰める前に、`develop` を基点に work branch を作成する。
  - `develop` branch がなければ作成する。
- まず `docs/` と関連コードを読む。
- 不明点を推測で補完しない。
- 仕様が足りない場合は、実装ではなく仕様更新を優先する。
- `dig` skill を使い、人間のユーザーと詳細仕様を詰める。
  - 詰める範囲は `docs/design/development-flow.md` の初期マイルストーンに従う。
  - 未完了のマイルストーンを対象にする。
- 確定、検討中、保留、MVP対象外を明確に分ける。
- `current/` と `planned/` の二重管理を作らない。
- 詰めた内容に基づいて `docs/` 配下だけを更新する。
  - 実装は行わない。
  - 現在のマイルストーンでは決定できない事項を発見した場合は、将来マイルストーンへの申し送り事項として `docs/tasks/open-questions.md` に記載する。
  - 更新が完了したら自己レビューを行う。
- `develop` にマージするための Pull Request を作成する。
  - Pull Request の本文に `@codex review` を書いてレビューを受ける。
  - レビューコメントを確認し、修正が必要な場合は対応し、再度レビューを受ける。
  - 指摘なしでレビューが完了したら `develop` にマージし、work branch を削除する。
- 更新した仕様を実現するための Issue を GitHub に登録する。
  - Issue 本文は `docs/issue_template.md` に従い、`Goal`、`Source Spec`、`Phase Handoff`、`Acceptance Criteria`、`Out of Scope`、`Dependencies` を含める。
  - Issue は原則として、1〜3 個の `Acceptance Criteria`、1 つの主要モジュール、または 1 つの仕様セクションに収まる粒度にする。
  - `Source Spec` はファイル名だけでなく、対象セクション名または見出しまで指定する。
  - Issue が `docs/tasks/open-questions.md` の申し送り事項に関連する場合は `Applicable: Yes` とし、申し送り事項を `Phase Handoff` 欄に要約して記載する。
  - Issue が申し送り事項に関連しない場合は `Applicable: No` と記載する。

## 成果物

- 更新された仕様書
- 未確定事項の一覧
- 実装へ進める範囲の明示
- `develop` 向け Pull Request
- 更新仕様を実現する GitHub Issue
