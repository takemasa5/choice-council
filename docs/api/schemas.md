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
- 未知フィールドは失敗として扱う。
- 必須文字列は trim 後に空文字であってはならない。
- 配列要素の文字列は trim 後に空文字であってはならない。
- 必須配列は空配列を許容する。ただし、要素を含む場合は有効な値だけを含める。
- 失敗時は1回だけ再生成する。
- 再生成しても失敗した場合は、ユーザーに再生成可能な失敗表示を出す。

表示文言:

```text
この発言の生成に失敗しました。再生成できます。
```

## 専門家コメント

状態: `決定`

専門家コメントは、専門家ごとの個別 LLM 呼び出しで生成する。専門家は人間的なキャラクターではなく、役割と観点として扱う。

専門家コメント呼び出しの入力は、確定済み専門家ロールと現在文脈である。

| フィールド | 必須 | 内容 |
|---|---:|---|
| consultation | 必須 | ユーザーの相談内容 |
| currentPhase | 必須 | アプリ側の現在フェーズ |
| memo | 任意 | 現時点までのセッションメモ |
| expert | 必須 | 確定済み専門家ロール。`role_name`, `viewpoint`, `request` を含む |

`expert.viewpoint` は専門家へそのまま渡す指定観点であり、専門家は観点を推測で補完しない。

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

| フィールド | 必須 | 内容 |
|---|---:|---|
| role_name | 必須 | 表示する専門家ロール名 |
| viewpoint | 必須 | この専門家が重視する観点 |
| summary | 必須 | 通常表示用コメント。300〜400字程度 |
| key_point | 必須 | 最重要ポイント1つ |
| concern | 必須 | 気になるリスクや不明点。ない場合も「現時点では特になし」のように明示する |
| question_to_user | 必須 | 必要な場合の質問1つ。不要な場合は「なし」とする |
| confidence | 必須 | `high`, `medium`, `low` のいずれか |
| needs_research | 必須 | 外部情報の確認が必要なら `true` |

MVP では外部調査を実施しない。`needs_research: true` の内容と、「なし」以外の `question_to_user` は、断定せずセッションメモの未確認事項へ送る。

## ファシリテーター出力

状態: `決定`

ファシリテーター呼び出しの入力は、相談内容に加えて再開文脈を任意で含められる。

| フィールド | 必須 | 内容 |
|---|---:|---|
| consultation | 必須 | ユーザーの相談内容 |
| facts | 任意 | ユーザーが入力した事実・背景 |
| values | 任意 | ユーザーが重視したいこと |
| concerns | 任意 | ユーザーの不安なこと |
| expectedOutcome | 任意 | 期待する結果 |
| userQuestion | 任意 | 直前に提示した `user_question` の質問文、選択肢、必須フラグ |
| userQuestionAnswer | 任意 | 直前の `user_question` に対するユーザー回答。選択肢または「その他」の自由入力 |
| currentPhase | 任意 | 再開時のアプリ側現在フェーズ |
| memo | 任意 | 再開時点までに保持しているセッションメモ |

`currentPhase` と `memo` が入力に含まれる場合、ファシリテーターはそのフェーズとメモを現在の文脈として扱い、初回の前提整理からやり直さない。`userQuestion` と `userQuestionAnswer` が入力に含まれる場合は、その質問への回答として扱い、メモ更新と次アクションに反映する。

```json
{
  "current_phase": "premise",
  "current_phase_label": "前提整理",
  "phase_goal": "事実、希望、不安、不明点を整理する",
  "facilitator_message": "ユーザーに表示する進行コメント",
  "expert_requests": [
    {
      "role_name": "家計・生活負担アドバイザー",
      "viewpoint": "費用、送迎、親の時間、継続可能性",
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

| フィールド | 必須 | 内容 |
|---|---:|---|
| current_phase | 必須 | アプリ側の現在フェーズ、または許可された遷移先候補 |
| current_phase_label | 必須 | 画面表示用フェーズ名 |
| phase_goal | 必須 | 現在フェーズで達成すること |
| facilitator_message | 必須 | ユーザーに表示する進行コメント |
| expert_requests | 必須 | 専門家コメント生成が必要な場合の依頼。各要素は `role_name`, `viewpoint`, `request` を含む。不要な場合は空配列 |
| user_question | 必須 | ユーザー回答が必要な場合の質問。不要な場合は `null` |
| memo_updates | 必須 | この応答時点のセッションメモ案 |
| next_action | 必須 | アプリへの候補行動 |

`expert_requests` の各要素は、`role_name`, `viewpoint`, `request` を必須とする。`viewpoint` は専門家コメント呼び出しへそのまま渡す指定観点であり、専門家が推測で観点を補完しないために使う。

`user_question.options` は2件以上とし、必ず「その他」を含める。「その他」を選んだ場合、アプリは自由入力欄を表示する。`user_question` が `null` ではないにもかかわらず `options` に「その他」が含まれない出力は、バリデーション失敗として扱う。

`expert_requests` は、`next_action` が `request_experts` の場合に1件以上必要とする。

`current_phase` と `next_action` はアプリ側が検証する。状態機械で許可されない遷移を示す出力は失敗として扱う。

## セッションメモ

状態: `決定`

セッションメモ更新呼び出しの入力は、既存メモと新しく追加された整理内容である。

| フィールド | 必須 | 内容 |
|---|---:|---|
| consultation | 必須 | ユーザーの相談内容 |
| currentPhase | 必須 | アプリ側の現在フェーズ |
| previousMemo | 任意 | 更新前のセッションメモ |
| facilitatorResponse | 任意 | 新しく追加されたファシリテーター整理 |
| expertComments | 任意 | 新しく追加された専門家コメント |
| userAction | 任意 | ユーザーの回答または操作 |

```json
{
  "theme": "",
  "status": "in_progress | tentative_conclusion | pending_decision | pending_research | pending_family_discussion | action_plan",
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

| フィールド | 必須 | 内容 |
|---|---:|---|
| theme | 必須 | 相談テーマ |
| status | 必須 | 現在の整理状態 |
| facts | 必須 | 整理した事実 |
| values | 必須 | ユーザーが重視したこと |
| concerns | 必須 | 不安や懸念 |
| options | 必須 | 検討した選択肢 |
| decision_axes | 必須 | 判断軸 |
| expert_summaries | 必須 | 専門家コメントの要約、要点、懸念 |
| conflicts | 必須 | 意見が割れた点 |
| open_questions | 必須 | 未確認事項 |
| next_actions | 必須 | 次アクション候補 |

`status` と終了状態の対応:

| status | 対応する終了状態 |
|---|---|
| tentative_conclusion | 暫定結論 |
| pending_decision | 判断保留 |
| pending_research | 追加調査待ち |
| pending_family_discussion | 家族・関係者相談待ち |
| action_plan | 実行計画 |

`in_progress` はセッション途中の表示状態であり、終了状態ではない。`finalMarkdown` 呼び出し時に `SessionMemo.status` が `in_progress` の場合、アプリ側は終了メモ生成へ進まず、方向性整理または次アクション確認へ戻す。

## Markdown 終了メモ

状態: `決定`

`finalMarkdown` は、セッション終了時に Markdown 文字列を生成する呼び出しである。

```json
{
  "markdown": "# 意思決定メモ\n\n## 相談テーマ\n..."
}
```

| フィールド | 必須 | 内容 |
|---|---:|---|
| markdown | 必須 | `docs/design/memo-and-output.md#Markdown 終了メモ` の構成に従う Markdown |

Markdown 内では、断定できないことを断定しない。未確認事項と次アクションを必ず含める。

## モデル構成

MVP では、同一 LLM を複数ロールとして使う。ただし、内部設計では、将来的に異なる LLM を接続できるようにする。

専門家ロールは、次の要素で表現する。

- 役割定義。
- 重視する観点。
- 利用モデル。
- 入力文脈。
- 出力形式。

通常画面ではモデル名を表示しない。詳細表示では、使用モデル、生成時刻、入力した前提などを確認できるようにする。
