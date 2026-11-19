import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown for model output, hardened against exfiltration (OWASP LLM01/LLM02):
 *  - raw HTML is dropped (skipHtml),
 *  - images are never rendered, so a poisoned answer can't beacon data out
 *    through an <img> URL,
 *  - links survive only if they point inside this app; anything else is shown
 *    as plain text.
 */
export function isAllowedHref(href: string | undefined): boolean {
  if (!href) return false;
  return href.startsWith("/") && !href.startsWith("//");
}

const components: Components = {
  img: () => null,
  a: ({ href, children }) =>
    isAllowedHref(href) ? (
      <a href={href} className="underline">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

export function SafeMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      components={components}
      urlTransform={(url) => (isAllowedHref(url) ? url : "")}
    >
      {text}
    </ReactMarkdown>
  );
}
