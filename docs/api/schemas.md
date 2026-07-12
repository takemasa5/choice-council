# JSON Schema 方針

MVP時点から LLM 出力は構造化する。実装では `src/shared/schemas` を信頼できる境界として扱い、バックエンドで検証してからフロントエンドへ返す。

## 呼び出し単位

| 呼び出し | 役割 |
|---|---|
| facilitator | フェーズ管理、質問、専門家選定、次アクション決定 |
| expert | 指定観点からの短い意見、懸念、確認事項の提示 |
| sessionMemo | フェーズ区切りでの整理メモ更新 |
| finalMarkdown | 終了時の意思決定メモ生成 |

## バリデーション

- 必須項目の欠落、型不整合は失敗として扱う。
- 失敗時は1回だけ再生成する。
- 再生成しても失敗した場合は、ユーザーに再生成可能な失敗表示を出す。

表示文言:

```text
この発言の生成に失敗しました。再生成できます。
```

## 専門家コメント

```json
{
  "role_name": "家計・生活負担アドバイザー",
  "viewpoint": "費用、送迎、親の時間、継続可能性",
  "summary": "300〜400字程度の表示用コメント",
  "key_point": "最重要ポイント1つ",
  "concern": "気になるリスクや不明点",
  "question_to_user": "必要ならユーザーへの質問1つ",
  "confidence": "high | medium | low",
  "needs_research": true
}
```

## ファシリテーター出力

```json
{
  "current_phase": "premise",
  "current_phase_label": "前提整理",
  "phase_goal": "事実、希望、不安、不明点を整理する",
  "facilitator_message": "ユーザーに表示する進行コメント",
  "expert_requests": [
    {
      "role_name": "家計・生活負担アドバイザー",
      "request": "費用と生活負担の観点から重要な論点を挙げる"
    }
  ],
  "user_question": {
    "question": "この相談では外部情報の調査も使って進めますか？",
    "options": [
      "必要に応じて調査する",
      "まず調査してから議論する",
      "調査なしで整理する",
      "その他"
    ],
    "required": true
  },
  "memo_updates": {
    "theme": "",
    "status": "in_progress",
    "facts": [],
    "values": [],
    "concerns": [],
    "options": [],
    "decision_axes": [],
    "expert_summaries": [],
    "conflicts": [],
    "open_questions": [],
    "next_actions": []
  },
  "next_action": "wait_user | request_experts | update_memo | move_phase | finish"
}
```

## セッションメモ

```json
{
  "theme": "",
  "status": "in_progress | tentative_conclusion | pending_research | pending_discussion | action_plan",
  "facts": [],
  "values": [],
  "concerns": [],
  "options": [],
  "decision_axes": [],
  "expert_summaries": [],
  "conflicts": [],
  "open_questions": [],
  "next_actions": []
}
```

## モデル構成

MVP では、同一 LLM を複数ロールとして使う。ただし、内部設計では、将来的に異なる LLM を接続できるようにする。

専門家ロールは、次の要素で表現する。

- 役割定義。
- 重視する観点。
- 利用モデル。
- 入力文脈。
- 出力形式。

通常画面ではモデル名を表示しない。詳細表示では、使用モデル、生成時刻、入力した前提などを確認できるようにする。
