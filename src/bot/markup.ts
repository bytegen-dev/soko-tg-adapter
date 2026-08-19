import { escapeHtml } from "./text.js";

const TELEGRAM_TAG_NAMES = new Set(["b", "i", "u", "s", "code", "pre", "a"]);

function escapeHref(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Inline markdown: bold, italic, code, links. */
function formatInline(text: string): string {
  let remaining = text;
  let output = "";

  while (remaining.length > 0) {
    const linkMatch = remaining.match(/^\[([^\]]*)\]\(([^)]*)\)/);
    if (linkMatch) {
      const label = escapeHtml(linkMatch[1] ?? "");
      const href = escapeHref(linkMatch[2] ?? "");
      output += `<a href="${href}">${label}</a>`;
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/s);
    if (boldMatch) {
      output += `<b>${escapeHtml(boldMatch[1] ?? "")}</b>`;
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`([^`\n]+)`/);
    if (codeMatch) {
      output += `<code>${escapeHtml(codeMatch[1] ?? "")}</code>`;
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*(?!\*)(.+?)\*(?!\*)/s);
    if (italicMatch) {
      output += `<i>${escapeHtml(italicMatch[1] ?? "")}</i>`;
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const underscoreItalic = remaining.match(/^_(.+?)_/s);
    if (underscoreItalic) {
      output += `<i>${escapeHtml(underscoreItalic[1] ?? "")}</i>`;
      remaining = remaining.slice(underscoreItalic[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/[\[*_`]/);
    if (nextSpecial === -1) {
      output += escapeHtml(remaining);
      break;
    }
    if (nextSpecial === 0) {
      output += escapeHtml(remaining[0] ?? "");
      remaining = remaining.slice(1);
      continue;
    }

    output += escapeHtml(remaining.slice(0, nextSpecial));
    remaining = remaining.slice(nextSpecial);
  }

  return output;
}

function formatHeaderTitle(title: string): string {
  const parts = title.split(/\s+\*\s+/);
  const headerContent = formatInline(parts[0] ?? "");
  const headerLine = headerContent.includes("<b>")
    ? headerContent
    : `<b>${headerContent}</b>`;
  const bullets = parts
    .slice(1)
    .map((part) => `\n• ${formatInline(part)}`)
    .join("");
  return `${headerLine}${bullets}`;
}

function formatBlockLine(line: string): string {
  const headerMatch = /^(#{1,3})\s+(.+)$/.exec(line);
  if (headerMatch) {
    return formatHeaderTitle(headerMatch[2] ?? "");
  }

  const bulletMatch = /^\*\s+(.+)$/.exec(line);
  if (bulletMatch) {
    return `• ${formatInline(bulletMatch[1] ?? "")}`;
  }

  const parts = line.split(/\s+\*\s+/);
  if (parts.length > 1) {
    const intro = formatInline(parts[0] ?? "");
    const bullets = parts
      .slice(1)
      .map((part) => `\n• ${formatInline(part)}`)
      .join("");
    return `${intro}${bullets}`;
  }

  return formatInline(line);
}

/**
 * Convert common Markdown (bold, italic, headers, bullets, links) to Telegram HTML.
 */
export function markdownToTelegramHtml(source: string): string {
  if (!source.trim()) {
    return "";
  }

  let text = source.replace(/\r\n/g, "\n");
  text = text.replace(/:\s*###\s+/g, ":\n### ");
  text = text.replace(/(?<!\n)###\s+/g, "\n### ");

  const lines = text.split("\n");
  return lines
    .map((line) => formatBlockLine(line.trimEnd()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Truncate HTML without leaving unclosed Telegram tags. */
export function truncateHtml(html: string, max: number): string {
  if (html.length <= max) {
    return html;
  }

  let cut = html.slice(0, max - 1);
  const lastAmp = cut.lastIndexOf("&");
  const lastSemi = cut.lastIndexOf(";");
  if (lastAmp > lastSemi) {
    cut = cut.slice(0, lastAmp);
  }
  cut = cut.replace(/<[^>]*$/, "");

  const openTags: string[] = [];
  const tagRegex = /<\/?([a-z]+)(?:\s[^>]*)?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(cut)) !== null) {
    const tag = match[1]?.toLowerCase() ?? "";
    if (!TELEGRAM_TAG_NAMES.has(tag)) {
      continue;
    }
    if (match[0].startsWith("</")) {
      const index = openTags.lastIndexOf(tag);
      if (index >= 0) {
        openTags.splice(index, 1);
      }
    } else {
      openTags.push(tag);
    }
  }

  for (let index = openTags.length - 1; index >= 0; index -= 1) {
    cut += `</${openTags[index]}>`;
  }

  return `${cut}…`;
}

export function formatMessageHtml(content: string, maxLength?: number): string {
  try {
    const html = markdownToTelegramHtml(content);
    if (maxLength === undefined) {
      return html;
    }
    return truncateHtml(html, maxLength);
  } catch {
    const plain = escapeHtml(content.replace(/\s+/g, " ").trim());
    if (maxLength === undefined || plain.length <= maxLength) {
      return plain;
    }
    return `${plain.slice(0, maxLength - 1)}…`;
  }
}
