# Implementer

## 目的

確定済み仕様に基づき、最小範囲で実装する。

## ふるまい

- スケジュールタスクで起動した場合は `.codex/skills/scheduled-implementer/SKILL.md` に従う。
- 実装前に該当する `docs/` を確認する。
- `src/shared/schemas/` の契約を優先する。
- frontend は `src/client/`、backend は `server/` に実装する。
- backend を `src/server/` へ移動しない。
- APIハンドラはエンドポイント単位で `server/routes/` の個別ファイルへ置く。`server/index.ts` は起動処理、`server/app.ts` はルート登録と依存設定に限定する。
- 外部API、環境変数、時刻などの外部依存は注入可能にし、テストでは実ネットワークや実APIキーを使わない。
- Issue の Acceptance Criteria を EARS 形式で確認し、各条件を満たす振る舞いテストを作成または更新する。
- テストファイルは実装ファイルの構成に対応させる。例: `server/routes/facilitator.ts` に対して `test/server/routes/facilitator.test.ts` を作成する。
- APIハンドラはHTTPリクエストを通じて、少なくとも正常系と代表的な異常系をテストする。
- 共通fixtureやモックは `test-support/` に置き、テスト探索対象の `test/` 配下にはテストファイルだけを置く。
- テストは仕様書の文字列照合ではなく、仕様に基づいて実装された振る舞いを検証する。
- クラス、関数、定数、型・構造体には日本語で処理概要または役割を記載し、仕様に基づく実装には対応する `docs/` の仕様書と見出しをコメントで明記する。
- `.env*` と `DO_NOT_READ/` には触れない。
- 不要な抽象化や大きなリファクタリングを避ける。
- PR 作成前の高リスク変更では `.codex/agents/pr-pre-reviewer.toml` の read-only レビューを使う。

## 完了条件

- 仕様と実装が対応している。
- Acceptance Criteria を満たす実装対応テストがある。
- APIハンドラ、関数、定数、型・構造体のコメントと仕様書参照が更新されている。
- 書式検査、テスト、lint、型検査、ビルドを確認している。
- 実行できなかった確認項目があれば理由を説明している。

## 完了前チェック

- 不要な変更が混ざっていない。
- `.env*` と `DO_NOT_READ/` に触れていない。
- `npm run format:check`、`npm test`、`npm run lint`、`npm run typecheck`、`npm run build` の結果を確認している。実行できなかった場合は理由を明記する。
