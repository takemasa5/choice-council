# Product Documents

このディレクトリは仕様駆動開発の起点です。

仕様書は `current/` と `planned/` に分けず、`docs/` を単一の正として扱います。未確定事項は該当仕様内に状態を明記し、実装対象になった時点で GitHub Issue に登録します。

## ファイル構成

- `overview.md`: コンセプト、目的、対象ユーザー。
- `use-cases.md`: MVP で扱う相談テーマ。
- `mvp-scope.md`: MVP に含める機能、含めない機能。
- `success-criteria.md`: プロトタイプの成功判定。

実装判断では、このディレクトリと `docs/design/`, `docs/api/`, `docs/prompts/` の分割仕様を参照します。実装の優先順位と依存関係は GitHub Issues を正とします。
