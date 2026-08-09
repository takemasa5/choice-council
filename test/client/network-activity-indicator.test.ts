import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkActivityIndicator } from "../../src/client/NetworkActivityIndicator";

test("通信中のときだけ既定または指定した文言の共通インジケータを表示する", () => {
  const defaultMarkup = renderToStaticMarkup(
    createElement(NetworkActivityIndicator, { isActive: true }),
  );
  const activeMarkup = renderToStaticMarkup(
    createElement(NetworkActivityIndicator, {
      isActive: true,
      className: "group-chat-network-activity",
      message: "専門家の回答を生成中",
    }),
  );
  const inactiveMarkup = renderToStaticMarkup(
    createElement(NetworkActivityIndicator, { isActive: false }),
  );

  assert.match(defaultMarkup, /通信中/);
  assert.match(activeMarkup, /専門家の回答を生成中/);
  assert.match(activeMarkup, /role="status"/);
  assert.match(activeMarkup, /aria-live="polite"/);
  assert.match(activeMarkup, /group-chat-network-activity/);
  assert.match(activeMarkup, /network-activity-spinner/);
  assert.equal(inactiveMarkup, "");
});
