# Choice Council

Choice Council は、複数の専門家ロールとファシリテーターを使って、正解が一つに定まらない個人・家庭の意思決定を支援するプロトタイプです。

## 技術スタック

- Frontend: TypeScript + React + Vite
- Backend: TypeScript + Node.js + Express
- LLM: OpenAI API / Gemini API / Groq API（環境変数で選択）

## 開発方針

仕様駆動開発で進めます。仕様や状態遷移、API契約、プロンプトを `docs/` に記録し、そこから実装へ反映します。

backend は `server/`、frontend は `src/client/`、共有 schema は `src/shared/` に置きます。構成方針は `docs/project-structure.md`、仕様書の管理方針は `docs/spec-management.md` を参照してください。

## CI

GitHub Actions で以下を確認します。

- `npm run typecheck`
- `npm run build`
- gitleaks によるシークレット検出

## 起動

`LLM_PROVIDER` でアプリ全体のLLMを選択し、対応するAPIキーを環境変数として設定してから起動します。`LLM_PROVIDER` を省略した場合は `openai` を使用します。

| `LLM_PROVIDER` | 必須のAPIキー    | 任意のモデル指定 | 既定モデル            |
| -------------- | ---------------- | ---------------- | --------------------- |
| `openai`       | `OPENAI_API_KEY` | `OPENAI_MODEL`   | `gpt-5-mini`          |
| `gemini`       | `GEMINI_API_KEY` | `GEMINI_MODEL`   | `gemini-2.5-flash`    |
| `groq`         | `GROQ_API_KEY`   | `GROQ_MODEL`     | `openai/gpt-oss-120b` |

`groq` は GPT-OSS 120B を対象とし、Qwen は対象外です。Groq 利用時は JSON Schema の strict structured output と `reasoning_effort=low` を使用します。

Groq の最大出力トークン数は `GROQ_MAX_OUTPUT_TOKENS` で指定できます。`groq` を選択した場合だけ使用し、1 以上 65536 以下の整数を指定します。未指定時は `1200` で、Groq API に渡す最大出力トークン数です。

```bash
npm install
npm run dev
```

ブラウザでは `http://127.0.0.1:5173` を開きます。
