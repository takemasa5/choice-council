type MarkdownBlock =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[] };

/** 許可した最小限のMarkdownだけを安全なReact要素へ変換して表示する。 */
export function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-document">
      {parseMarkdownBlocks(markdown).map((block, index) => {
        if (block.type === "heading1") {
          return <h1 key={index}>{block.text}</h1>;
        }

        if (block.type === "heading2") {
          return <h2 key={index}>{block.text}</h2>;
        }

        if (block.type === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{block.lines.join(" ")}</p>;
      })}
    </div>
  );
}

/** 空行を区切りとして、許可したブロック構文だけを読み取る。 */
function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = getHeading(line);
    if (heading) {
      blocks.push(heading);
      index += 1;
      continue;
    }

    const listItem = getListItem(line);
    if (listItem !== null) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = getListItem(lines[index]);
        if (item !== null) {
          items.push(item);
          index += 1;
          continue;
        }

        const continuation = getListContinuation(lines[index]);
        if (continuation === null || getHeading(lines[index]) !== null) break;
        items[items.length - 1] += `\n${continuation}`;
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index];
      if (
        paragraphLine.trim() === "" ||
        getHeading(paragraphLine) !== null ||
        getListItem(paragraphLine) !== null
      ) {
        break;
      }
      paragraphLines.push(paragraphLine);
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

/** # と ## だけを見出しとして読み取る。 */
function getHeading(
  line: string,
): Extract<MarkdownBlock, { type: "heading1" | "heading2" }> | null {
  const heading1 = line.match(/^ {0,3}#[ \t]+(.+)$/);
  if (heading1) return { type: "heading1", text: heading1[1] };

  const heading2 = line.match(/^ {0,3}##[ \t]+(.+)$/);
  if (heading2) return { type: "heading2", text: heading2[1] };

  return null;
}

/** 先頭0〜3空白の順不同リストだけを、入れ子にせず描画する。 */
function getListItem(line: string): string | null {
  if (/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) {
    return null;
  }

  if (/^ {0,3}\*[ \t]*$/.test(line)) {
    return "";
  }

  if (/^ {0,3}-[ \t]+$/.test(line)) {
    return null;
  }

  const match = line.match(/^ {0,3}(?:-|\*)[ \t]+(.+)$/);
  return match ? match[1] : null;
}

/** 入れ子にせず、直前の項目に続く1〜3空白の本文行だけを読み取る。 */
function getListContinuation(line: string): string | null {
  const match = line.match(/^ {1,3}([^\s].*)$/);
  return match ? match[1] : null;
}
