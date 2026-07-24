# クライアント UI 整合性・コンポーネント分割 実装計画

状態: `決定`

## 目的

決定済みの UI 仕様と実装を一致させ、`App.tsx` へ集中しているフェーズ固有の UI、通信、状態更新を責務単位で分離する。GitHub Issue の Acceptance Criteria に対応する実装順序を示す文書であり、ロードマップやマイルストーンではない。

## 完成イメージ

```text
App
├── Application shell
│   ├── Header / phase indicator
│   ├── Phase router
│   ├── Phase return controls
│   └── Session memo panel / mobile drawer
├── Phase flows
│   ├── ConsultationInputPhase
│   ├── PremisePhase
│   ├── ExpertSelectionPhase
│   ├── DeliberationPhase
│   ├── GroupChatPhase
│   └── FinalMemoPhase
└── Session persistence and phase-history modules
```

`App` は shell と横断状態の調停だけを担当する。各フェーズの Hook が通信、ローディング、エラー、リトライ、フェーズ固有の入力を担当し、完了結果だけを明示的なコールバックで横断状態へ渡す。

## 実装順序

1. **仕様・契約の同期**
   - 前提整理の必須質問、終了状態、終了メモ入力、保存対象、直近発言数を shared schema と API 契約へ反映する。
   - 割り込み機能の UI、state、保存形式、API 呼び出しを削除する。
   - API 契約変更には route、prompt、HTTP テストを同じ Issue で更新する。

2. **横断状態と保存の整理**
   - セッション保存形式に編集中の専門家候補と `expertRepliesSinceUser` を追加する。
   - 未送信のグループチャット自由入力は保存しない。
   - 戻り先より後の状態を一貫して破棄し、`final_memo → group_chat` だけは会話履歴、会話要約、確定済み専門家、セッションメモを保持する。

3. **前提整理・専門家選定の分離**
   - 必須質問の入力、送信、リトライを `PremisePhase` と対応 Hook へ置く。
   - 専門家候補の確定と初回コメント生成のエラーを `ExpertSelectionPhase` 側で扱う。
   - 意見交換開始のエラーは `DeliberationPhase` に表示し、その場で再試行できるようにする。

4. **グループチャットと終了フローの分離**
   - `useGroupChatPhase` が開始、専門家回答、次ターン、再生成を完結して扱う。
   - 全履歴は表示・保存し、LLM 呼び出しには `recentGroupChatMessageLimit`（8件）で切り詰めた発言だけを渡す。
   - 「検討を終える」は常時表示し、通信中だけ無効化する。終了状態はモーダルで選択する。
   - 確定後は `final_memo` へ遷移して自動生成する。生成失敗時は `group_chat` へ戻し、`memo.status` を `in_progress` に戻して終了状態を選び直す。

5. **アプリケーションシェルの整理**
   - `PhaseContent` をフェーズ UI 選択だけに限定する。
   - セッションメモ、前フェーズへ戻る操作、モバイル用メモ引き出しを shell 側へ分離する。
   - セッションメモは全 schema 項目を表示し、メモ更新時に通知する。
   - モバイルでは初期状態が閉じたメモ引き出しを表示する。

6. **不要コードの削除と検証**
   - コメントアウトされた割り込み UI、未使用 state、開発用ログを削除する。
   - 保存・復元、戻る操作、終了状態、終了メモ失敗、直近発言の境界値をテストする。
   - 実装ルールに照らして、変更対象ファイルに新しい責務が残っていないことを確認する。

## 対象外

- 外部調査機能、PDF / HTML 出力、ログイン、過去セッションの永続保存。
- CSS の全面刷新。必要なモーダル、進行表示、モバイル引き出しの最小スタイル変更は対象に含む。
