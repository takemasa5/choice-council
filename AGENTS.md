# AGENTS.md

このリポジトリで作業する AI エージェント向けのルールです。

## 基本方針

- チャットでは日本語で回答する。
- 実装よりも仕様を優先する。
- 不明点を推測で補完しない。
- 要求されていない変更は行わない。
- 変更はできる限り小さくする。
- 既存設計を尊重し、動作変更とリファクタリングを同時に行わない。

## 禁止・注意事項

- `.env*` ファイルを変更・コミットしない。
- API キーなどの秘密情報をコード、ドキュメント、テストデータへ埋め込まない。
- `DO_NOT_READ/` 配下は参照しない。
- 生成物、依存ディレクトリ、ログを不要に追加しない。
- 設定ファイルを変更する必要がある場合は、事前に変更理由と影響範囲を説明する。

## プロジェクト構成

- `docs/`: 仕様、設計、API 契約、プロンプト、開発方針を置く。
- `server/`: Express backend を置く。MVP では root 直下の独立ディレクトリとして維持する。
- `src/client/`: React frontend を置く。
- `src/shared/`: frontend と backend で共有する型、schema、状態機械を置く。

backend は `src/server/` へ移動しない。理由は、frontend と backend の runtime 境界を明確にし、将来 LLM 実行層や Python backend を切り出しやすくするため。

## 仕様駆動の進め方

1. 変更する仕様を `docs/` で確認する。
2. 仕様が不足している場合は、先に `docs/` を更新する。
3. `docs/api/` または `docs/design/` を変えた場合は、必要に応じて `src/shared/` の型・schema へ反映する。
4. 仕様に基づいて `server/` と `src/client/` を最小範囲で実装する。
5. 可能な限り `npm run typecheck` と `npm run build` を実行して確認する。

仕様書は `current/` と `planned/` に分けない。`docs/` を単一の正として更新し、未確定事項や今後の実装候補は各仕様内のステータス、または `docs/tasks/` に分けて管理する。

## 定期実行の実装者

- スケジュールタスクで起動した場合は `.codex/skills/scheduled-implementer/SKILL.md` に従う。
- PR 作成前の高リスク変更では `.codex/agents/pr-pre-reviewer.toml` の read-only レビューを使う。
- Pull Request は `develop` 向けに作成し、本文に `Closes #<issue-number>` と `@codex review` を含める。

## コーディング方針

- TypeScript の strict 前提で実装する。
- frontend/backend 間の契約は `src/shared/schemas/` を優先する。
- LLM 出力は構造化し、backend 側で検証してから返す。
- エラーを握りつぶさず、ユーザーに説明可能なエラーメッセージへ変換する。

## OpenAI API 方針

- OpenAI API は backend から呼び出す。
- API key は `OPENAI_API_KEY` 環境変数から読む。
- model は `OPENAI_MODEL` で上書き可能にする。
- 外部調査機能は MVP では実装しない。必要な情報は未確認事項として扱う。

## 完了前チェック

- 仕様と実装の整合性が取れている。
- 不要な変更が混ざっていない。
- `.env*` と `DO_NOT_READ/` に触れていない。
- `npm run typecheck` と `npm run build` の結果を確認している。実行できなかった場合は理由を明記する。
