import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownDocument } from "../../src/client/MarkdownDocument";

test("許可したMarkdownブロックを見出し、段落、順不同リストとして描画する", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown:
        "# 意思決定メモ\n\n## 相談テーマ\n\n旅行先を決めます。\n予算を確認します。\n\n- 候補A\n* 候補B",
    }),
  );

  assert.match(markup, /<h1>意思決定メモ<\/h1>/);
  assert.match(markup, /<h2>相談テーマ<\/h2>/);
  assert.match(markup, /<p>旅行先を決めます。\n予算を確認します。<\/p>/);
  assert.match(markup, /<ul><li>候補A<\/li><li>候補B<\/li><\/ul>/);
});

test("先頭3空白までのH1とH2を見出しとして描画する", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown: " # 空白付きH1\n\n   ## 空白付きH2",
    }),
  );

  assert.match(markup, /<h1>空白付きH1<\/h1>/);
  assert.match(markup, /<h2>空白付きH2<\/h2>/);
  assert.doesNotMatch(markup, /<p> {1,3}#{1,2} /);
});

test("タブまたは複数空白で区切ったH1とH2を見出しとして描画する", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown: "#\tタブ付きH1\n\n##   複数空白付きH2",
    }),
  );

  assert.match(markup, /<h1>タブ付きH1<\/h1>/);
  assert.match(markup, /<h2>複数空白付きH2<\/h2>/);
});

test("先頭1〜3空白の順不同リストを描画し、4空白は段落として扱う", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown: " - 1空白の項目\n   * 3空白の項目\n    - 4空白の項目",
    }),
  );

  assert.match(markup, /<ul><li>1空白の項目<\/li><li>3空白の項目<\/li><\/ul>/);
  assert.doesNotMatch(markup, /<li>4空白の項目<\/li>/);
  assert.match(markup, /<p> {4}- 4空白の項目<\/p>/);
});

test("HTMLは要素化せずテキストとしてエスケープする", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown: "<script>alert('unsafe')</script>",
    }),
  );

  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;alert/);
});

test("対応外のMarkdownは通常テキストとして表示する", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown: "1. 番号付き項目\n2. 次の項目\n\n```\nconst value = 1;\n```",
    }),
  );

  assert.doesNotMatch(markup, /<ol>|<code>|<pre>/);
  assert.match(markup, /<p>1\. 番号付き項目\n2\. 次の項目<\/p>/);
  assert.match(markup, /<p>```\nconst value = 1;\n```<\/p>/);
});

test("許可外の見出しは段落の通常テキストとして表示する", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown: "### 許可外の見出し\n本文",
    }),
  );

  assert.doesNotMatch(markup, /<h3>/);
  assert.match(markup, /<p>### 許可外の見出し\n本文<\/p>/);
});

test("H3以上、4空白インデント、区切り空白なしは見出しとして描画しない", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownDocument, {
      markdown: "###\t許可外H3\n\n    # 4空白H1\n\n#空白なしH1",
    }),
  );

  assert.doesNotMatch(markup, /<h[12]>/);
  assert.match(markup, /<p>###\t許可外H3<\/p>/);
  assert.match(markup, /<p> {4}# 4空白H1<\/p>/);
  assert.match(markup, /<p>#空白なしH1<\/p>/);
});
