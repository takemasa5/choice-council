import assert from "node:assert/strict";
import test from "node:test";
import { shouldPreserveRestoredExpertDrafts } from "../../src/client/hooks/use-expert-selection-phase";

test("復元済みresponseと同じ候補キーなら編集済みdraftを維持する", () => {
  assert.equal(
    shouldPreserveRestoredExpertDrafts(
      '[{"role_name":"家計アドバイザー"}]',
      '[{"role_name":"家計アドバイザー"}]',
    ),
    true,
  );
});

test("候補キーが異なるなら新しいファシリテーター候補へ同期する", () => {
  assert.equal(
    shouldPreserveRestoredExpertDrafts(
      '[{"role_name":"家計アドバイザー"}]',
      '[{"role_name":"法律アドバイザー"}]',
    ),
    false,
  );
});

test("復元キーがない旧セッションは新しい候補へ同期する", () => {
  assert.equal(
    shouldPreserveRestoredExpertDrafts(
      null,
      '[{"role_name":"家計アドバイザー"}]',
    ),
    false,
  );
});
