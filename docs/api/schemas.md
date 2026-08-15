# JSON Schema 方針

MVP時点から LLM 出力は構造化する。実装では `src/shared/schemas` を信頼できる境界として扱い、バックエンドで検証してからフロントエンドへ返す。

## 呼び出し単位

| 呼び出し      | 役割                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| facilitator   | フェーズ管理、質問、専門家選定、グループチャットの発言者指名、次アクション決定 |
| expert        | 指定観点からの初回コメント、または指名されたグループチャット回答               |
| sessionMemo   | フェーズ区切りでの整理メモ更新                                                 |
| finalMarkdown | 終了時の意思決定メモ生成                                                       |

## バリデーション

- 必須項目の欠落、型不整合は失敗として扱う。
- 未知フィールドは失敗として扱う。
- 必須文字列は trim 後に空文字であってはならない。
- 配列要素の文字列は trim 後に空文字であってはならない。
- 必須配列は空配列を許容する。ただし、要素を含む場合は有効な値だけを含める。
- 生成要求は最大2回とする。初回の構造化出力が失敗した場合だけ、失敗分類と必要最小限の field path を含む安全な失敗要約を使い、JSONを再生成するよう2回目の要求へ指示を加える。
- 2回目も失敗した場合は、`invalid_model_response` とユーザー向けの汎用文言を返す。応答本文にモデル出力、入力、内部例外を含めない。
- `invalid_model_response` のログには応答本文や入力を含めず、route名、schema名、再試行回数、失敗分類、終了理由、Zod issue の path と code だけを記録する。失敗分類は `empty_content`、`invalid_json`、`schema_validation`、`post_validation` のいずれかとする。
- 選択したプロバイダーのAPIキー未設定時は `missing_llm_api_key`、不正なLLM設定時は `invalid_llm_configuration`、未対応の `LLM_PROVIDER` 指定時は `unsupported_llm_provider`、外部LLM API呼び出し失敗時は `llm_request_failed` を返す。

表示文言:

```text
この発言の生成に失敗しました。再生成できます。
```

## 通常画面の表示契約

ファシリテーター、専門家初回コメント、グループチャット、セッションメモに表示する LLM 文字列は、Markdown を許可しない。見出し、箇条書き、番号付きリスト、コードブロック、改行を含まない簡潔なプレーンテキストとする。終了メモの `markdown` だけはこの制約の対象外とする。

通常画面向けの LLM 文字列に含まれる ASCII の `<` と `>` は、検証前に全角の `＜` と `＞` へ正規化して表示する。

- 通常フローのファシリテーター表示文言、質問、指名理由は各 150 字以内とする。グループチャットの `FacilitatorTurn.message`、`question`、`requestReason` は各 200 字以内とする。

専門家選定でユーザーが編集して確定する候補は LLM 通常画面出力ではない。`role_name`、`viewpoint`、`request` は非空文字列として保存・専門家コメント生成に渡し、改行、Markdown、150字超の内容も原文を保持する。

- 専門家初回コメントの `summary` は 300 字以内、`proposal.content`、`key_point`、`concern`、`question_to_user` は各 120 字以内とする。`proposal.benefits`、`sacrifices`、`conditions` の各要素は 80 字以内とする。
- グループチャットの専門家発言である `GroupChatMessage.content` は 200 字以内とする。
- セッションメモの `theme` は 120 字以内とし、各配列は最大 3 件、各要素は 80 字以内とする。

## 専門家コメント

状態: `決定`

専門家コメントは、専門家ごとの個別 LLM 呼び出しで生成する。専門家は人間的なキャラクターではなく、役割と観点として扱う。ファシリテーターは、同じ判断軸を異なる価値・制約から見るロールを優先して候補にし、必要な不足観点だけを補完する。人格的な対立を作ることはしない。

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
  "summary": "300字以内の表示用コメント",
  "proposal": {
    "id": "proposal-budget-first",
    "name": "予算上限を先に決める案",
    "content": "総費用の上限を決め、その範囲で候補を絞る。",
    "benefits": ["継続負担を見通しやすい"],
    "sacrifices": ["候補の幅が狭まる"],
    "conditions": ["家計上限を確認できる"]
  },
  "key_point": "最重要ポイント1つ",
  "concern": "気になるリスクや不明点",
  "question_to_user": "必要ならユーザーへの質問1つ",
  "confidence": "high | medium | low",
  "needs_research": true
}
```

| フィールド       | 必須 | 内容                                                                                               |
| ---------------- | ---: | -------------------------------------------------------------------------------------------------- |
| role_name        | 必須 | 表示する専門家ロール名                                                                             |
| viewpoint        | 必須 | この専門家が重視する観点                                                                           |
| summary          | 必須 | 通常表示用コメント。300 字以内                                                                     |
| proposal         | 必須 | この専門家が初回コメントで提示する具体的な案。`id`、案名、内容、利点、犠牲にする点、成立条件を持つ |
| key_point        | 必須 | 最重要ポイント1つ                                                                                  |
| concern          | 必須 | 気になるリスクや不明点。ない場合も「現時点では特になし」のように明示する                           |
| question_to_user | 必須 | 必要な場合の質問1つ。不要な場合は「なし」とする                                                    |
| confidence       | 必須 | `high`, `medium`, `low` のいずれか                                                                 |
| needs_research   | 必須 | 外部情報の確認が必要なら `true`                                                                    |

MVP では外部調査を実施しない。`needs_research: true` の内容と、「なし」以外の `question_to_user` は、断定せずセッションメモの未確認事項へ送る。

## ファシリテーター出力

状態: `決定`

初回開始と前提整理での回答は別 endpoint として扱う。ほかのフェーズに継続入力を追加する場合も、この request schema を拡張せず、対象フェーズに対応する schema を追加する。

### `POST /api/facilitator/start`

`ConsultationStartRequest` は初回開始専用の strict schema とする。

| フィールド      | 必須 | 内容                         |
| --------------- | ---: | ---------------------------- |
| consultation    | 必須 | ユーザーの相談内容           |
| facts           | 任意 | ユーザーが入力した事実・背景 |
| values          | 任意 | ユーザーが重視したいこと     |
| concerns        | 任意 | ユーザーの不安なこと         |
| expectedOutcome | 任意 | 期待する結果                 |

`/start` の応答は、`premise` に表示する必須質問を必ず1件含める。`user_question.required` は `true`、`next_action` は `wait_user`、`expert_requests` は空配列とする。相談内容が十分に具体的でも、ユーザーが前提を確認・補足できる質問を返す。

### `POST /api/facilitator/respond`

`FacilitatorResponseRequest` は、前提整理で必須質問に回答するための strict schema とする。

| フィールド         | 必須 | 内容                                                               |
| ------------------ | ---: | ------------------------------------------------------------------ |
| consultation       | 必須 | 初回に入力した相談内容                                             |
| currentPhase       | 必須 | 固定値 `premise`                                                   |
| userQuestion       | 必須 | 直前の `user_question`。`required` は `true`                       |
| userQuestionAnswer | 必須 | 非空文字列。通常の選択肢は選択肢文言、「その他」は自由入力文を送る |
| memo               | 必須 | 直前の `FacilitatorResponse.memo_updates`                          |

`/respond` のファシリテーターは、質問と回答を前提整理へ反映し、初回の前提整理からやり直さない。追加質問は返さず、専門家選定へ進むための候補を返す。

前提整理で返せる必須質問は、`/start` の応答で最大1件とする。`/respond` の応答で必須質問を返してはならない。

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
  "user_question": null,
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
  "next_action": "request_experts"
}
```

| フィールド          | 必須 | 内容                                                                                                          |
| ------------------- | ---: | ------------------------------------------------------------------------------------------------------------- |
| current_phase       | 必須 | アプリ側の現在フェーズ、または許可された遷移先候補                                                            |
| current_phase_label | 必須 | 画面表示用フェーズ名                                                                                          |
| phase_goal          | 必須 | 現在フェーズで達成すること                                                                                    |
| facilitator_message | 必須 | ユーザーに表示する進行コメント                                                                                |
| expert_requests     | 必須 | 専門家コメント生成が必要な場合の依頼。各要素は `role_name`, `viewpoint`, `request` を含む。不要な場合は空配列 |
| user_question       | 必須 | `/start` では必須質問1件、`/respond` では `null`                                                              |
| memo_updates        | 必須 | この応答時点のセッションメモ案                                                                                |
| next_action         | 必須 | アプリへの候補行動                                                                                            |

`expert_requests` の各要素は、`role_name`, `viewpoint`, `request` を必須とする。候補全体では、相談に固有の判断軸について相反または補完する価値・制約が分かるように選ぶ。`viewpoint` は専門家コメント呼び出しへそのまま渡す指定観点であり、専門家が推測で観点を補完しないために使う。

`user_question.options` は2件以上とし、必ず「その他」を含める。「その他」を選んだ場合、アプリは自由入力欄を表示する。`user_question` が `null` ではないにもかかわらず `options` に「その他」が含まれない出力は、バリデーション失敗として扱う。

`expert_requests` は、`next_action` が `request_experts` の場合に1件以上必要とする。`user_question` と非空の `expert_requests` は共存できず、`user_question` が存在する場合は空配列とする。この不変条件は共有 `FacilitatorResponse` schema でも検証する。

`current_phase` と `next_action` はアプリ側が検証する。状態機械で許可されない遷移を示す出力は失敗として扱う。

### 初回専門家コメント生成

状態: `決定`

ファシリテーターの `expert_requests` は、システム設定の上限以内（初期値5件）とする。上限を超える候補を含む応答は不正として扱い、共通のバリデーション規則に従って再生成する。

ユーザーが確定した専門家ロールごとに `POST /api/expert/comment` を1回呼び出す。各リクエストは `ExpertCommentRequest` に従い、`currentPhase` は `deliberation` とする。確定済み専門家ロールは1〜5件とし、同じ `role_name` と `viewpoint` の組み合わせを複数含めることを許容する。

フロントエンドは全リクエストを並列で開始し、すべてが成功した場合のみ専門家コメント一覧と「意見交換をはじめる」操作を表示する。1件でも失敗した場合は、すべてのリクエストが完了してから成功分を破棄し、専門家コメントを表示・保存しない。画面には `専門家コメントの生成に失敗しました。もう一度お試しください。` を表示する。ユーザーが再試行した場合は、確定済みの全専門家ロールに対して同じリクエストを再送する。

バックエンドは各コメント生成で共通のバリデーション規則に従い、構造化出力の検証失敗時に1回だけ再生成する。クライアントは専門家コメント単位の自動再試行を行わない。

### グループチャット

状態: `決定`

全初回専門家コメントを表示した後、ユーザーの「意見交換をはじめる」操作で `group_chat` に遷移する。`src/shared/schemas` の `PhaseSchema`、`server/app.ts` の route 登録、`src/client/` のフローはこの契約へ同期する。旧 `POST /api/facilitator/deliberation` と `direction` フェーズは使用しない。

グループチャットの前に、ユーザーは初回コメント内の**案**を対象に、次のいずれかを必ず選ぶ。専門家ロール自体を選択対象にしない。

| 選択種別     | 値          | 制約                                   | 意味                                                         |
| ------------ | ----------- | -------------------------------------- | ------------------------------------------------------------ |
| 1案を深掘り  | `deep_dive` | `proposalId` を1件                     | 提案者の根拠を検証し、他者が反論・代替・成立条件を具体化する |
| 2案を比較    | `compare`   | 重複しない `proposalIds` をちょうど2件 | 2案のトレードオフを検討する                                  |
| まだ選ばない | `defer`     | 案IDなし                               | 案を早期に脱落させず、比較軸を整理する                       |

`proposalId` は初回コメントの `proposal.id` を指す。初回コメントは独立・並列に生成されるため、クライアントは確定済み専門家の入力順で `proposal-1`、`proposal-2` のように案IDを決定的に再採番する。LLM が返した `proposal.id` は選択・保存・後続APIの識別子として使用しない。開始リクエストは、選択種別と参照する案IDが初回コメントの案と一致することを検証する。未選択、不明な案ID、比較対象が2件以外のリクエストは受け付けない。

グループチャットの開始後は、`discussionContext` をすべての専門家・ファシリテーター呼び出しに渡す。これは `selection` と、初回コメント由来の全 `proposals` を持つ strict object である。各要素は提案者の `participantId`、表示役割名、案本体（案ID、案名、内容、利点、犠牲にする点、成立条件）を一体で持つ。開始リクエストの `confirmedExperts` の順序と `participantId` をそのまま使うため、同名・同観点の専門家も区別できる。選択済み案の実体と提案者を参照できるようにし、`defer` の場合も案を早期に脱落させず全案を比較対象として利用できるようにする。

#### 共通データ

`GroupChatMessage` は、画面に表示する発言を表す strict schema とする。

| フィールド    | 必須 | 内容                                                                                                                          |
| ------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------- |
| id            | 必須 | 発言を一意に識別するID                                                                                                        |
| speakerType   | 必須 | `facilitator`、`expert`、`user` のいずれか                                                                                    |
| speakerName   | 必須 | 表示用の発言者名                                                                                                              |
| participantId | 必須 | 発言者を一意に識別するID。専門家名・観点の重複を許容するために使う                                                            |
| content       | 必須 | 表示する発言本文。LLM 由来のファシリテーター・専門家発言は 200 字以内のプレーンテキストとし、ユーザー発言は入力原文を保持する |
| createdAt     | 必須 | 発言時刻                                                                                                                      |

`speakerType` と `speakerName` は、ファシリテーターが次の発言者を指定する構造でも同じ名称を使う。`participantId` は内部の対応付けに使い、表示上の発言者名には用いない。

`FacilitatorTurn` は、ファシリテーターの進行発言と次の発言者の指定を表す strict schema とする。

| フィールド           |     必須 | 内容                                                                                                                                       |
| -------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| message              |     必須 | 指名理由と質問を含む、表示用のファシリテーター発言。200 字以内                                                                             |
| requestedSpeaker     |     必須 | `speakerType` が `expert` または `user` であり、`speakerName`、`participantId` を持つ、次に回答する1人                                     |
| requestReason        |     必須 | その参加者を指名した理由。200 字以内                                                                                                       |
| question             |     必須 | 指名相手に回答してほしい内容。200 字以内                                                                                                   |
| userOptions          | 条件付き | 指名先が `user` の場合は2件以上の重複しない選択肢配列。必ず「そのまま意見交換を続けて」を含み、「その他」は含めない。専門家の場合は `null` |
| memoUpdate           |     必須 | 重要な整理がある場合の完全な `SessionMemo`、ない場合は `null`                                                                              |
| contextSummaryUpdate |     必須 | 古い発言を圧縮した会話要約の更新、不要な場合は `null`                                                                                      |

アプリ側は `requestedSpeaker` が常に1人だけであり、`speakerType` が `expert` または `user` であることを検証する。`facilitator` は次の回答者として指定してはならない。確定済み専門家と同名・同観点の専門家が複数いる場合、`participantId` で対象を照合する。

#### `POST /api/facilitator/group-chat/start`

`GroupChatStartRequest` は、初回専門家コメントからグループチャットを開始する strict schema とする。

| フィールド            | 必須 | 内容                                                                                              |
| --------------------- | ---: | ------------------------------------------------------------------------------------------------- |
| consultation          | 必須 | 初回に入力した相談内容。画面には再表示しない                                                      |
| currentPhase          | 必須 | 固定値 `group_chat`                                                                               |
| memo                  | 必須 | グループチャット開始時の `SessionMemo`                                                            |
| confirmedExperts      | 必須 | 1〜5件の確定済み専門家。各要素に一意な `participantId` を持つ                                     |
| initialExpertComments | 必須 | 全件生成に成功した初回専門家コメント。確定済み専門家と同数・同順序                                |
| discussionSelection   | 必須 | `deep_dive`、`compare`、`defer` のいずれかの案選択。案IDは初回コメントの `proposal.id` と一致する |

応答は `FacilitatorTurn` のうち開始専用の strict schema とする。ファシリテーターは、初回コメントの単純な再要約をせず、`discussionSelection` を会話の起点として論点を示して、`confirmedExperts` に含まれる専門家を次の1人として指名する。`requestedSpeaker.participantId` は選んだ専門家の値と完全一致させ、`speakerType` は `expert`、`userOptions` は `null` とする。

#### `POST /api/expert/group-chat`

`GroupChatExpertReplyRequest` は、指名された専門家の1回の回答を生成する strict schema とする。

| フィールド          | 必須 | 内容                                                                               |
| ------------------- | ---: | ---------------------------------------------------------------------------------- |
| consultation        | 必須 | 初回に入力した相談内容                                                             |
| currentPhase        | 必須 | 固定値 `group_chat`                                                                |
| memo                | 必須 | 最新の `SessionMemo`                                                               |
| contextSummary      | 必須 | 過去発言の累積要約                                                                 |
| recentMessages      | 必須 | 文脈として必要な末尾から最大8件の `GroupChatMessage` 配列                          |
| expert              | 必須 | `FacilitatorTurn.requestedSpeaker` と一致する専門家                                |
| facilitatorQuestion | 必須 | ファシリテーターがその専門家へ出した質問                                           |
| discussionContext   | 必須 | 開始時に確定した案選択と、初回コメント由来の全具体案。専門家は回答の起点として使う |

応答は、指定専門家の `GroupChatMessage` 1件とする。`id` は入力 `recentMessages` に含まれる既存のIDと重複してはならず、重複する構造化出力は無効として再生成対象にする。専門家の回答後、クライアントは次のファシリテーターターンを要求する。

#### `POST /api/facilitator/group-chat/next`

`GroupChatNextRequest` は、専門家またはユーザーの1回答後に次の進行を決める strict schema とする。

| フィールド             | 必須 | 内容                                                                           |
| ---------------------- | ---: | ------------------------------------------------------------------------------ |
| consultation           | 必須 | 初回に入力した相談内容                                                         |
| currentPhase           | 必須 | 固定値 `group_chat`                                                            |
| memo                   | 必須 | 最新の `SessionMemo`                                                           |
| contextSummary         | 必須 | 過去発言の累積要約                                                             |
| recentMessages         | 必須 | 末尾から最大8件の `GroupChatMessage` 配列                                      |
| confirmedExperts       | 必須 | 一意な `participantId` を含む確定済み専門家                                    |
| expertRepliesSinceUser | 必須 | 前回のユーザー意思表示以降の連続した専門家回答数。0〜2                         |
| discussionContext      | 必須 | 開始時に確定した案選択と、初回コメント由来の全具体案。次の進行の起点として使う |

応答は `FacilitatorTurn` とする。アプリ側は、`expertRepliesSinceUser` が2の場合に専門家を指名する応答を不正として扱う。値が1の場合、ファシリテーターは専門家またはユーザーを指名できる。直近の非ファシリテーター発言が専門家で、確定済み専門家が2人以上ある場合は、次に専門家を指名するなら直前の専門家とは別の `participantId` を指定しなければならない。これにより、連続する専門家回答を主張への応答として扱う。進行は常に `discussionContext.selection` を起点とし、具体案は `discussionContext.proposals` から参照する。`deep_dive` では根拠の検証と反論・代替・成立条件、`compare` では2案のトレードオフ、`defer` では案を脱落させない比較軸の整理を求める。ユーザーを指名した場合、アプリは選択肢と自由入力 textarea を常時同時に表示する。選択肢を選ぶと、その文言をユーザー回答として直ちに送信する。ユーザーの自由入力、選択肢回答、「そのまま意見交換を続けて」のいずれもユーザー意思表示としてカウンタを0へ戻す。

専門家回答の生成・構造化出力の検証に成功した後、次のファシリテーターターンの生成または検証だけが失敗した場合、アプリは成功済み専門家発言と `expertRepliesSinceUser` を保持する。セッションメモと累積要約は更新せず、ユーザーは専門家回答を再生成せずに次の進行だけを再試行できる。

それ以外の発言生成または構造化出力の検証が失敗した場合、アプリは会話履歴、セッションメモ、`expertRepliesSinceUser` を更新してはならない。対象の発言だけをユーザー操作で再生成できる状態にする。

`recentMessages` の上限は、shared 定数 `recentGroupChatMessageLimit` の値 `8` を正とする。グループチャットと終了メモ生成はこの同じ上限を使い、会話履歴全件をリクエストへ渡さない。

### 初回・前提整理 route の追加検証

`/api/facilitator/start` と `/api/facilitator/respond` は、共通の `FacilitatorResponse` schema に加えて、次を検証する。

- `current_phase` は `premise` である。
- `/start` では、`user_question` が必ず存在し、`required` は `true`、`next_action` は `wait_user`、`expert_requests` は空配列である。
- `/respond` では、`user_question` は `null`、`next_action` は `request_experts`、`expert_requests` は 1 件以上である。
- `update_memo`、`move_phase`、`finish`、`required: false` の質問はこの route では受け入れない。

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
| theme            | 必須 | 相談テーマ。120 字以内           |
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

セッションメモの各配列は最大 3 件とし、各要素は 80 字以内のプレーンテキストとする。

`in_progress` はセッション途中の表示状態であり、終了状態ではない。`finalMarkdown` 呼び出し時に `SessionMemo.status` が `in_progress` の場合、アプリ側は終了メモ生成へ進まない。`group_chat` の終了確認でユーザーが選んだ終了状態をクライアント側で `SessionMemo.status` へ設定してから呼び出す。この状態設定のための LLM またはセッションメモ更新 API 呼び出しは行わない。

## Markdown 終了メモ

状態: `決定`

`finalMarkdown` は、セッション終了時に Markdown 文字列を生成する呼び出しである。

終了メモ生成リクエストは次の入力を持つ。

| フィールド     | 必須 | 内容                                      |
| -------------- | ---: | ----------------------------------------- |
| consultation   | 必須 | 初回に入力した相談内容                    |
| memo           | 必須 | 終了状態が設定された最新の `SessionMemo`  |
| expertComments | 任意 | 初回専門家コメント                        |
| contextSummary | 必須 | グループチャットの累積要約                |
| recentMessages | 必須 | 末尾から最大8件の `GroupChatMessage` 配列 |

```json
{
  "markdown": "# 意思決定メモ\n\n## 相談テーマ\n..."
}
```

| フィールド | 必須 | 内容                                                                                         |
| ---------- | ---: | -------------------------------------------------------------------------------------------- |
| markdown   | 必須 | `docs/design/memo-and-output.md#Markdown 終了メモ` の構成に従う、全文 3000 字以内の Markdown |

終了メモ生成リクエストは、終了状態が設定された `SessionMemo` に加え、グループチャットの累積要約と直近発言を含む。終了メモの `セッションログ要約` には、重要な論点の展開、ユーザーの意思表示、終了状態に至った経緯を反映する。発言全文は出力しない。

Markdown 内では、断定できないことを断定しない。未確認事項と次アクションを必ず含める。各セクションは簡潔にし、画面では見出し、段落、順不同リストだけを安全に描画する。

## モデル構成

MVP では、環境変数で選択した単一の LLM プロバイダーを複数ロールとして使う。選択肢は `openai`、`gemini`、`groq` であり、`LLM_PROVIDER` を省略した場合は `openai` とする。

プロバイダーごとの設定は次のとおりとする。APIキーとモデル名はバックエンドだけが読み取り、ブラウザへ渡さない。

| プロバイダー | APIキー          | モデル指定     | 既定モデル            |
| ------------ | ---------------- | -------------- | --------------------- |
| `openai`     | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-5-mini`          |
| `gemini`     | `GEMINI_API_KEY` | `GEMINI_MODEL` | `gemini-2.5-flash`    |
| `groq`       | `GROQ_API_KEY`   | `GROQ_MODEL`   | `openai/gpt-oss-120b` |

`groq` は GPT-OSS 120B を対象とし、Qwen は対象外とする。Groq の構造化出力は、Groq strict structured output で受理できる制約だけを含む送信用 JSON Schema を用い、`reasoning_effort` は `low`、`temperature` は `0.6` に固定する。

Groq の出力は、送信用 JSON Schema とアプリ側の Zod 検証による二層構成とする。送信用 schema で構造を強制し、アプリ側の Zod で文字数、配列数、フィールド間の相関条件を含む完全な契約を検証する。

`GROQ_MAX_OUTPUT_TOKENS` は `groq` 利用時の生成トークン上限であり、文字数上限ではない。1 以上 65536 以下の整数だけを許可し、未指定時は `1200` とする。Groq API の最大出力トークン数として渡す。

ロールごとのプロバイダー・モデル選択は MVP の対象外とする。

専門家ロールは、次の要素で表現する。

- 役割定義。
- 重視する観点。
- 利用モデル。
- 入力文脈。
- 出力形式。

通常画面ではモデル名を表示しない。詳細表示では、使用モデル、生成時刻、入力した前提などを確認できるようにする。
