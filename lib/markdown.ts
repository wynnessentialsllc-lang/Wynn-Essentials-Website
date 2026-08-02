// A small, safe Markdown → HTML renderer for blog posts. It escapes all HTML
// FIRST, then applies a fixed set of Markdown transforms, so the output can only
// ever contain a known-safe tag set — raw HTML an author types is rendered as
// text, never executed. No dependencies.
//
// Supported: ## / ### headings, **bold**, *italic*, `code`, [links](url),
// ![images](url), - / 1. lists, > blockquotes, --- rules, paragraphs.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Only allow safe URL schemes; anything else (javascript:, data:, …) is dropped.
function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(u)) return u.replace(/"/g, "%22");
  return null;
}

// Inline formatting, applied to already-escaped text.
function inline(text: string): string {
  let out = text;
  // Images: ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) => {
    const safe = safeUrl(url);
    return safe ? `<img src="${safe}" alt="${alt}" loading="lazy" />` : alt;
  });
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const safe = safeUrl(url);
    const ext = safe && /^https?:\/\//i.test(safe);
    return safe ? `<a href="${safe}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>` : label;
  });
  // Inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold then italic
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md.replace(/\r\n/g, "\n")).split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { html.push(`<${list.type}>${list.items.map(i => `<li>${inline(i)}</li>`).join("")}</${list.type}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { html.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushAll(); continue; }

    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) { flushAll(); const level = h[1].length; html.push(`<h${level}>${inline(h[2])}</h${level}>`); continue; }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushAll(); html.push("<hr />"); continue; }

    const q = /^&gt;\s?(.*)$/.exec(line);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }

    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara(); flushQuote();
      const type = ul ? "ul" : "ol";
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push((ul ? ul[1] : ol![1]));
      continue;
    }

    flushList(); flushQuote();
    para.push(line);
  }
  flushAll();
  return html.join("\n");
}
