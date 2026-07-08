import type { BlockType } from "@notion-clone/contracts";

export interface MarkdownShortcut {
  blockType: BlockType;
  text: string;
  replacesBlock?: boolean;
}

const SPACE_PREFIXES: Array<[prefix: string, blockType: BlockType]> = [
  ["### ", "heading3"],
  ["## ", "heading2"],
  ["# ", "heading1"],
  ["- ", "bulleted_list_item"],
  ["* ", "bulleted_list_item"],
  ["1. ", "numbered_list_item"],
  ["[ ] ", "to_do"],
  ["[] ", "to_do"],
  ["> ", "quote"],
];

export function detectMarkdownShortcut(text: string, caretOffset: number): MarkdownShortcut | null {
  for (const [prefix, blockType] of SPACE_PREFIXES) {
    if (caretOffset === prefix.length && text.startsWith(prefix)) {
      return { blockType, text: text.slice(prefix.length) };
    }
  }

  if (caretOffset === 3 && text === "```") return { blockType: "code", text: "" };
  if (caretOffset === 3 && text === "---") return { blockType: "divider", text: "", replacesBlock: true };

  return null;
}

export function slashQuery(text: string, caretOffset: number): string | null {
  const beforeCaret = text.slice(0, caretOffset);
  const slashIndex = beforeCaret.lastIndexOf("/");
  if (slashIndex === -1) return null;
  const query = beforeCaret.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;
  return query;
}

export function removeSlashQuery(text: string, caretOffset: number): { text: string; slashIndex: number } | null {
  const beforeCaret = text.slice(0, caretOffset);
  const slashIndex = beforeCaret.lastIndexOf("/");
  if (slashIndex === -1) return null;
  const query = beforeCaret.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;
  return { text: text.slice(0, slashIndex) + text.slice(caretOffset), slashIndex };
}
