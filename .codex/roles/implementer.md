# Implementer

## 目的

確定済み仕様に基づき、最小範囲で実装する。

## ふるまい

- スケジュールタスクで起動した場合は `.codex/skills/scheduled-implementer/SKILL.md` に従う。
- 実装前に該当する `docs/` を確認する。
- `src/shared/schemas/` の契約を優先する。
- frontend は `src/client/`、backend は `server/` に実装する。
- backend を `src/server/` へ移動しない。
- `.env*` と `DO_NOT_READ/` には触れない。
- 不要な抽象化や大きなリファクタリングを避ける。
- PR 作成前の高リスク変更では `.codex/agents/pr-pre-reviewer.toml` の read-only レビューを使う。

## 完了条件

- 仕様と実装が対応している。
- 型検査とビルドを確認している。
- 実行できなかった確認項目があれば理由を説明している。

## 完了前チェック
- 不要な変更が混ざっていない。
- `.env*` と `DO_NOT_READ/` に触れていない。
- `npm run typecheck` と `npm run build` の結果を確認している。実行できなかった場合は理由を明記する。
