# プロジェクト構成

## 採用方針

MVP では次の構成を維持する。

```text
docs/
server/
src/
  client/
  shared/
```

backend 実装は `server/` に置き、`src/server/` へは移動しない。

## 理由

- `server/` は Express backend の runtime 境界として分かりやすい。
- `src/client/` と `src/shared/` を分けることで、Vite frontend と共有型の責務が明確になる。
- backend が `src/shared/` を参照する現在の形で、frontend/backend の schema 共有は成立している。
- 将来 Python backend や LLM 実行層を切り出す場合、root 直下の `server/` のほうが置き換えやすい。

## 配置ルール

| パス            | 用途                                                   |
| --------------- | ------------------------------------------------------ |
| `docs/product/` | ユーザー体験、スコープ、用語、プロダクト仕様           |
| `docs/design/`  | 状態遷移、画面構成、開発方針                           |
| `docs/api/`     | API 契約、JSON schema 方針                             |
| `docs/prompts/` | LLM 呼び出し単位のプロンプト                           |
| `docs/tasks/`   | 未確定事項、実装候補、マイルストーン                   |
| `server/`       | Express backend、OpenAI API 呼び出し、backend services |
| `src/client/`   | React frontend                                         |
| `src/shared/`   | frontend/backend 共有の型、schema、状態機械            |

## 将来見直す条件

次のいずれかが起きた場合だけ、構成変更を検討する。

- backend が複数サービスに分かれ、root 直下の `server/` が大きくなりすぎた。
- frontend/backend の package 分離が必要になった。
- Python など TypeScript 以外の backend を本格採用する。
- デプロイ先の制約で monorepo 構成を明確に分ける必要が出た。
