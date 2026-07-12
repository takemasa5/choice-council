# 開発の進め方

## 基本方針

- 仕様を先に更新し、その後に実装する。
- 画面、状態遷移、API、プロンプトを分けて管理する。
- MVPでは TypeScript + React + Node で実装する。
- OpenAI API はバックエンドから呼び出し、ブラウザへ API キーを渡さない。
- 将来 Python backend が必要になった場合は、LLM 実行層を切り出して置き換える。
- backend 実装は `server/` に置き、`src/server/` へは移動しない。
- 仕様書は `docs/current/` と `docs/planned/` に分けず、`docs/` を単一の正として更新する。

## 変更フロー

1. `docs/product/` でユーザー体験やスコープを確認する。
2. `docs/design/` で画面構成と状態遷移を更新する。
3. `docs/api/` で API 契約と JSON schema を更新する。
4. `docs/prompts/` で LLM 呼び出しごとのプロンプトを更新する。
5. 未確定事項や実装候補は `docs/tasks/` に分けるか、該当仕様内に状態を明記する。
6. `src/shared/` の型と schema を更新する。
7. `server/` と `src/client/` を実装する。
8. ビルドとテストで確認する。

## 参照ドキュメント

- `docs/product/overview.md`
- `docs/product/use-cases.md`
- `docs/product/mvp-scope.md`
- `docs/design/user-experience.md`
- `docs/design/roles.md`
- `docs/design/research.md`
- `docs/design/memo-and-output.md`
- `docs/design/safety-and-privacy.md`
- `docs/api/schemas.md`
- `docs/prompts/README.md`
- `docs/project-structure.md`
- `docs/spec-management.md`

## 初期マイルストーン

| ID | 内容 |
|---|---|
| M1 | 仕様ドキュメント整理、状態機械、JSON schema |
| M2 | 相談開始画面、API疎通、ファシリテーター初回応答 |
| M3 | 専門家選定、専門家コメント並列生成 |
| M4 | セッションメモ、一時保存、割り込み |
| M5 | 終了メモMarkdown出力 |
| M6 | ガードレール、エラー時再生成、UI改善 |
