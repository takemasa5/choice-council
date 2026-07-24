---
name: scheduled-implementer
description: Codex がスケジュールタスク、wakeup、automation、または定期実装者として起動されたときに使う。GitHub Issues と Pull Requests を確認し、レビュー指摘対応、未ブロックの最古 Issue 選定、最小実装、develop 向け PR 作成、@codex review 依頼、停止までを定義する。
---

# 定期実行の実装者

この skill は、Choice Council の定期実行実装者 workflow を定義する。

最優先で `AGENTS.md` に従う。`DO_NOT_READ/` は読まない。`.env*` は変更しない。

## 起動条件

スケジュール、wakeup、automation、またはユーザーから定期実行の実装者として動くよう依頼された場合に、この skill を使う。

ソースコードまたは設定ファイルを変更する前に、リポジトリ状態を確認する。

1. `pwd`、`git status --short`、現在の branch、`git remote -v` を確認する。
2. GitHub tools または `gh` で Issues、Pull Requests、comments、reviews、labels、checks、merge state を確認する。
3. 必要な GitHub access が使えない場合は進めない。

## 仕掛かり中の作業を優先する

1. GitHub Issues を確認する。
2. `in-progress` Issue があり、すでに Pull Request が作成済みであれば、新しい Issue を選ぶ前にその Pull Request を処理する。
3. 修正には既存 Pull Request の branch を使う。

### 既存 PR にレビュー指摘がある場合

review comments または requested changes がある場合:

1. Pull Request の review comments と unresolved review threads を読む。
2. 指摘された修正だけを実装する。
3. 適切な checks を実行する。
4. branch を push する。
5. Pull Request に次を comment する。

```text
@codex review
```

6. 停止する。CI や review は待たない。

### 既存 PR のレビューが指摘なしで完了している場合

review が完了しており対応すべき指摘がない場合:

1. CI/checks が passing であること、または repository policy 上 merge 可能であることを確認する。
2. Pull Request を `develop` に merge する。
3. GitHub 上で Pull Request の merge を確認した後にだけ remote branch を削除する。
4. linked Issue を close する。
5. GitHub 上で merge 済みであることを確認する。
6. 未コミットの local changes がないことを確認する。
7. local work branch を削除する。
8. 停止する。

未マージの branch は絶対に削除しない。

## 新しい Issue を選定する

次の条件を満たす open Issue を 1 件選ぶ。

1. `question` label が付いていない。
2. Issue 本文の `Dependencies` に記載された Issue がすべて完了している、または依存がない。
3. 条件を満たす Issue が複数ある場合は、作成日時が最も古い Issue を選ぶ。

Issue を選定したら:

1. `in-progress` label を付ける。
2. 次の Issue sections を読む。
   - `Goal`
   - `Source Spec`
   - `Acceptance Criteria`
   - `Out of Scope`
   - `Dependencies`
3. 必須 section が欠けている、または安全に実装するには不足している場合は、`question` label を付けて停止する。

## Branch 作成

ソースコードまたは設定ファイルを変更する前に:

1. `develop` を更新または確認する。
2. `develop` を基点に work branch を作成する。
3. 次のような分かりやすい branch 名を使う。

```text
codex/issue-<issue-number>-<short-slug>
```

既存 Pull Request への対応では、新しい branch を作らず、その Pull Request の branch を使う。

## 実装

1. Issue の `Acceptance Criteria` を満たす最小限の変更を実装する。
2. `Out of Scope` を守る。
3. 振る舞いや仕様を変更する Issue では、実装前に docs を更新する。
4. 新しい振る舞いの追加または bug fix では、必要に応じて test を追加または更新する。
5. `docs/design/implementation-rules.md` に従い、追加する責務の配置先と既存ファイルの分割要否を確認する。
6. Pull Request の作成または更新前に、関連 checks を実行する。

標準 checks:

```bash
npm run typecheck
npm run build
```

## 自己レビュー

Pull Request 作成前に:

1. diff と Issue の `Acceptance Criteria` を照合する。
2. `Out of Scope` の作業が含まれていないことを確認する。
3. `.env*` と `DO_NOT_READ/` に触れていないことを確認する。
4. 必要のない生成物が含まれていないことを確認する。
5. 新しい責務を肥大化した既存ファイルへ追加していないことを確認する。例外がある場合は、Issue または PR に理由とレビュー承認を記録する。

変更が次のいずれかを含む場合は、Pull Request 作成前に `pr-pre-reviewer` subagent を使う。

- 中核ロジック。
- 複数モジュール。
- schema または API contract の変更。
- 状態機械の変更。
- 仕様移動または広範な docs 再構成。
- セキュリティ、プライバシー、secret-handling に関わる振る舞い。

subagent review は read-only とし、P0/P1 相当の正しさ、仕様不一致、重大な test 不足に限定する。

## Pull Request

`develop` 向けに Pull Request を作成する。

Pull Request 本文には必ず次を含める。

```text
Closes #<issue-number>

@codex review
```

Pull Request 作成後は停止する。review や CI は待たない。

既存 Pull Request に修正を push した場合は、`@codex review` を comment して停止する。

## 停止条件

次のいずれかに該当したら停止する。

- Pull Request を作成した。
- 既存 Pull Request に修正を push し、`@codex review` を comment した。
- review 済み Pull Request を merge し、branch を安全に clean up し、Issue を close した。
- 選定した Issue の仕様が不足しており、`question` label を付けた。
- 必要な GitHub access が使えない。
- working tree に安全な進行を妨げる予期しない変更がある。
