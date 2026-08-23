# Prompts

このディレクトリでは、OpenAI API、Gemini API、または Groq API へ渡すプロンプトを呼び出し単位で管理する。プロンプトの内容はプロバイダーに依存させず、バックエンドのLLMプロバイダー層で各SDKのリクエスト形式へ変換する。

MVPでは以下を分ける。

- `facilitator.md`
- `expert.md`
- `session-memo.md`
- `final-markdown.md`

各プロンプトは `docs/api/schemas.md` の構造化出力に従う。

Groq では GPT-OSS 120B を対象とし、Qwen は対象外とする。Groq の呼び出しは JSON Schema の strict structured output を使い、`reasoning_effort=low` を指定する。

## プロンプト契約の対象範囲

状態: `決定`

この文書ではプロンプト本文の品質検証までは扱わず、各呼び出しのプロンプト契約を定義する。

プロンプト契約には次を含める。

- 入力として渡す文脈。
- 従う JSON schema。
- その呼び出しが担当する責務。
- やってはいけないこと。

文言調整、few-shot 追加、モデルパラメータ調整、実出力の品質評価は、対応する GitHub Issue で扱う。
