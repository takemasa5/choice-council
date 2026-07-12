# Choice Council

Choice Council は、複数の専門家ロールとファシリテーターを使って、正解が一つに定まらない個人・家庭の意思決定を支援するプロトタイプです。

## 技術スタック

- Frontend: TypeScript + React + Vite
- Backend: TypeScript + Node.js + Express
- LLM: OpenAI API

## 開発方針

仕様駆動開発で進めます。仕様や状態遷移、API契約、プロンプトを `docs/` に記録し、そこから実装へ反映します。

backend は `server/`、frontend は `src/client/`、共有 schema は `src/shared/` に置きます。構成方針は `docs/project-structure.md`、仕様書の管理方針は `docs/spec-management.md` を参照してください。

## CI

GitHub Actions で以下を確認します。

- `npm run typecheck`
- `npm run build`
- gitleaks によるシークレット検出

## 起動

`OPENAI_API_KEY` を環境変数として設定してから起動します。

```bash
npm install
npm run dev
```

ブラウザでは `http://127.0.0.1:5173` を開きます。
