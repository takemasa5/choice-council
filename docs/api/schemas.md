# JSON Schema 方針

MVP時点から LLM 出力は構造化する。実装では `src/shared/schemas` を信頼できる境界として扱い、バックエンドで検証してからフロントエンドへ返す。

## 呼び出し単位

| 呼び出し      | 役割                                             |
| ------------- | ------------------------------------------------ |
| facilitator   | フェーズ管理、質問、専門家選定、次アクション決定 |
| expert        | 指定観点からの短い意見、懸念、確認事項の提示     |
| sessionMemo   | フェーズ区切りでの整理メモ更新                   |
| finalMarkdown | 終了時の意思決定メモ生成                         |

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

| フィールド   | 必須 | 内容                                                             |
| ------------ | ---: | ---------------------------------------------------------------- |
| consultation | 必須 | ユーザーの相談内容                                               |
| currentPhase | 必須 | アプリ側の現在フェーズ                                           |
| memo         | 任意 | 現時点までのセッションメモ                                       |
| expert       | 必須 | 確定済み専門家ロール。`role_name`, `viewpoint`, `request` を含む |

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

| フィールド       | 必須 | 内容                                                                     |
| ---------------- | ---: | ------------------------------------------------------------------------ |
| role_name        | 必須 | 表示する専門家ロール名                                                   |
| viewpoint        | 必須 | この専門家が重視する観点                                                 |
| summary          | 必須 | 通常表示用コメント。300〜400字程度                                       |
| key_point        | 必須 | 最重要ポイント1つ                                                        |
| concern          | 必須 | 気になるリスクや不明点。ない場合も「現時点では特になし」のように明示する |
| question_to_user | 必須 | 必要な場合の質問1つ。不要な場合は「なし」とする                          |
| confidence       | 必須 | `high`, `medium`, `low` のいずれか                                       |
| needs_research   | 必須 | 外部情報の確認が必要なら `true`                                          |

MVP では外部調査を実施しない。`needs_research: true` の内容と、「なし」以外の `question_to_user` は、断定せずセッションメモの未確認事項へ送る。

## ファシリテーター出力

状態: `決定`

M2 では初回開始と前提整理での回答を別 endpoint として扱う。後続マイルストーンで他フェーズの継続入力を追加する場合は、M2 の request schema を拡張せず、対象フェーズに対応する schema を追加する。

### `POST /api/facilitator/start`

`ConsultationStartRequest` は初回開始専用の strict schema とする。

| フィールド      | 必須 | 内容                         |
| --------------- | ---: | ---------------------------- |
| consultation    | 必須 | ユーザーの相談内容           |
| facts           | 任意 | ユーザーが入力した事実・背景 |
| values          | 任意 | ユーザーが重視したいこと     |
| concerns        | 任意 | ユーザーの不安なこと         |
| expectedOutcome | 任意 | 期待する結果                 |

### `POST /api/facilitator/respond`

`FacilitatorResponseRequest` は、M2 の前提整理で必須質問に回答するための strict schema とする。

| フィールド         | 必須 | 内容                                                               |
| ------------------ | ---: | ------------------------------------------------------------------ |
| consultation       | 必須 | 初回に入力した相談内容                                             |
| currentPhase       | 必須 | 固定値 `premise`                                                   |
| userQuestion       | 必須 | 直前の `user_question`。`required` は `true`                       |
| userQuestionAnswer | 必須 | 非空文字列。通常の選択肢は選択肢文言、「その他」は自由入力文を送る |
| memo               | 必須 | 直前の `FacilitatorResponse.memo_updates`                          |

`/respond` のファシリテーターは、質問と回答を前提整理へ反映し、初回の前提整理からやり直さない。

M2 の 1 回の応答で返せる `user_question` は最大 1 件とする。`/respond` の応答で必須質問が再び返る場合、最新の質問、回答、`memo_updates` を用いて `/respond` を繰り返せる。各リクエストはユーザー操作によってのみ送信する。

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

| フィールド          | 必須 | 内容                                                                                                          |
| ------------------- | ---: | ------------------------------------------------------------------------------------------------------------- |
| current_phase       | 必須 | アプリ側の現在フェーズ、または許可された遷移先候補                                                            |
| current_phase_label | 必須 | 画面表示用フェーズ名                                                                                          |
| phase_goal          | 必須 | 現在フェーズで達成すること                                                                                    |
| facilitator_message | 必須 | ユーザーに表示する進行コメント                                                                                |
| expert_requests     | 必須 | 専門家コメント生成が必要な場合の依頼。各要素は `role_name`, `viewpoint`, `request` を含む。不要な場合は空配列 |
| user_question       | 必須 | ユーザー回答が必要な場合の質問。不要な場合は `null`                                                           |
| memo_updates        | 必須 | この応答時点のセッションメモ案                                                                                |
| next_action         | 必須 | アプリへの候補行動                                                                                            |

`expert_requests` の各要素は、`role_name`, `viewpoint`, `request` を必須とする。`viewpoint` は専門家コメント呼び出しへそのまま渡す指定観点であり、専門家が推測で観点を補完しないために使う。

`user_question.options` は2件以上とし、必ず「その他」を含める。「その他」を選んだ場合、アプリは自由入力欄を表示する。`user_question` が `null` ではないにもかかわらず `options` に「その他」が含まれない出力は、バリデーション失敗として扱う。

`expert_requests` は、`next_action` が `request_experts` の場合に1件以上必要とする。

`current_phase` と `next_action` はアプリ側が検証する。状態機械で許可されない遷移を示す出力は失敗として扱う。

### M3 の専門家コメント生成

状態: `決定`

M3 で受け入れるファシリテーターの `expert_requests` は、システム設定の上限以内（初期値5件）とする。上限を超える候補を含む応答は不正として扱い、共通のバリデーション規則に従って再生成する。

M3 では、ユーザーが確定した専門家ロールごとに `POST /api/expert/comment` を1回呼び出す。各リクエストは `ExpertCommentRequest` に従い、`currentPhase` は `deliberation` とする。確定済み専門家ロールは1〜5件とし、同じ `role_name` と `viewpoint` の組み合わせを複数含めることを許容する。

フロントエンドは全リクエストを並列で開始し、すべてが成功した場合のみ専門家コメント一覧を表示して、ファシリテーター整理へ進める。1件でも失敗した場合は、すべてのリクエストが完了してから成功分を破棄し、専門家コメントを表示・保存しない。画面には `専門家コメントの生成に失敗しました。もう一度お試しください。` を表示する。ユーザーが再試行した場合は、確定済みの全専門家ロールに対して同じリクエストを再送する。

バックエンドは各コメント生成で共通のバリデーション規則に従い、構造化出力の検証失敗時に1回だけ再生成する。クライアントは専門家コメント単位の自動再試行を行わない。

### `POST /api/facilitator/deliberation`

状態: `決定`

M3 のファシリテーター整理は、全専門家コメントの生成成功後に呼び出す。`FacilitatorDeliberationRequest` は strict schema とする。

| フィールド       | 必須 | 内容                                                                           |
| ---------------- | ---: | ------------------------------------------------------------------------------ |
| consultation     | 必須 | 初回に入力した相談内容                                                         |
| currentPhase     | 必須 | 固定値 `deliberation`                                                          |
| memo             | 必須 | 前提整理時点の最新 `SessionMemo`                                               |
| confirmedExperts | 必須 | ユーザーが確定した `ExpertRequest` の配列。1〜5件                              |
| expertComments   | 必須 | 全件生成に成功した `ExpertComment` の配列。`confirmedExperts` と同数で同じ順序 |

`confirmedExperts` と `expertComments` は配列の位置で対応付ける。同じロール名・観点の重複を許可するため、ロール名・観点だけで対応付けてはならない。

MVP では、全専門家コメントをこのリクエストに含める。ファシリテーターは応答を `FacilitatorResponse` として返し、M3 では次の追加制約を満たす応答だけを受け入れる。

- `current_phase` は `direction` である。
- `user_question` は `null` である。
- `expert_requests` は空配列である。
- `next_action` は `move_phase` である。
- `memo_updates` には、専門家コメントの要点、対立点、未確認事項および次アクション候補を反映する。

応答が有効な場合、アプリはファシリテーター整理と `memo_updates` を表示・保持し、`deliberation` から `direction` へ遷移する。M3 では `POST /api/session-memo/update` を呼び出さない。

このAPIの呼び出しまたは応答検証に失敗した場合、生成済みの専門家コメントは保持して表示する。画面にはエラーと再試行操作を表示し、ユーザーが再試行した場合は同一の `FacilitatorDeliberationRequest` だけを再送する。専門家コメントを自動再生成してはならない。

### M2 route の追加検証

`/api/facilitator/start` と `/api/facilitator/respond` は、共通の `FacilitatorResponse` schema に加えて、次を検証する。

- `current_phase` は `premise` である。
- `user_question` が存在する場合、`required` は `true` かつ `next_action` は `wait_user` である。
- `user_question` が `null` の場合、`next_action` は `request_experts` であり、`expert_requests` は 1 件以上である。
- `update_memo`、`move_phase`、`finish`、`required: false` の質問は M2 の route では受け入れない。

## セッションメモ

状態: `決定`

セッションメモ更新呼び出しの入力は、既存メモと新しく追加された整理内容である。

| フィールド          | 必須 | 内容                                 |
| ------------------- | ---: | ------------------------------------ |
| consultation        | 必須 | ユーザーの相談内容                   |
| currentPhase        | 必須 | アプリ側の現在フェーズ               |
| previousMemo        | 任意 | 更新前のセッションメモ               |
| facilitatorResponse | 任意 | 新しく追加されたファシリテーター整理 |
| expertComments      | 任意 | 新しく追加された専門家コメント       |
| userAction          | 任意 | ユーザーの回答または操作             |

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

| フィールド       | 必須 | 内容                             |
| ---------------- | ---: | -------------------------------- |
| theme            | 必須 | 相談テーマ                       |
| status           | 必須 | 現在の整理状態                   |
| facts            | 必須 | 整理した事実                     |
| values           | 必須 | ユーザーが重視したこと           |
| concerns         | 必須 | 不安や懸念                       |
| options          | 必須 | 検討した選択肢                   |
| decision_axes    | 必須 | 判断軸                           |
| expert_summaries | 必須 | 専門家コメントの要約、要点、懸念 |
| conflicts        | 必須 | 意見が割れた点                   |
| open_questions   | 必須 | 未確認事項                       |
| next_actions     | 必須 | 次アクション候補                 |

`status` と終了状態の対応:

| status                    | 対応する終了状態     |
| ------------------------- | -------------------- |
| tentative_conclusion      | 暫定結論             |
| pending_decision          | 判断保留             |
| pending_research          | 追加調査待ち         |
| pending_family_discussion | 家族・関係者相談待ち |
| action_plan               | 実行計画             |

`in_progress` はセッション途中の表示状態であり、終了状態ではない。`finalMarkdown` 呼び出し時に `SessionMemo.status` が `in_progress` の場合、アプリ側は終了メモ生成へ進まず、方向性整理または次アクション確認へ戻す。

## Markdown 終了メモ

状態: `決定`

`finalMarkdown` は、セッション終了時に Markdown 文字列を生成する呼び出しである。

```json
{
  "markdown": "# 意思決定メモ\n\n## 相談テーマ\n..."
}
```

| フィールド | 必須 | 内容                                                                     |
| ---------- | ---: | ------------------------------------------------------------------------ |
| markdown   | 必須 | `docs/design/memo-and-output.md#Markdown 終了メモ` の構成に従う Markdown |

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
