import React, { cache } from "react";
// PrismLight, not the full `Prism` build: the latter ships every registered
// language (cuda, verilog, smalltalk, ...) in one ~636 kB chunk. We register
// only the languages the posts actually fence.
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ebnf from "react-syntax-highlighter/dist/esm/languages/prism/ebnf";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import nasm from "react-syntax-highlighter/dist/esm/languages/prism/nasm";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";

// Server component. Highlighting used to run in the browser: the Prism chunk
// (~31 kB gzipped) loaded on every post, and hydration re-tokenised every
// block on the main thread. Now the server emits class-named tokens once, and
// the two themes become plain CSS keyed off <html data-theme>, which
// ThemeProvider already keeps on the nearest anchor (same as `theme` from
// useTheme), so the code colours still follow the sky.

// Map the fence tags used in posts onto the registered grammars. Tags with no
// grammar (`txt`, `text`) or an unknown one fall through to plain text, which
// is exactly how PrismLight behaves for unregistered languages.
const LANGUAGE_ALIASES: Record<string, string> = {
    js: "javascript",
    sh: "bash",
    asm: "nasm",
    py: "python",
};

SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("ebnf", ebnf);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("nasm", nasm);
SyntaxHighlighter.registerLanguage("diff", diff);

type Sheet = Record<string, React.CSSProperties>;

const DARK_THEMES = ':is([data-theme="moonlight"], [data-theme="starlight"], [data-theme="twilight"])';

// camelCase -> kebab-case; `MozTabSize` -> `-moz-tab-size`, `msHyphens` -> `-ms-hyphens`
const kebab = (prop: string) =>
    (/^ms[A-Z]/.test(prop) ? "-" : "") + prop.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

// Same declarations the inline-style path applied: background dropped and
// forced transparent (the card supplies its own translucent fill).
function declarations(style: React.CSSProperties | undefined) {
    const out: string[] = [];
    for (const [prop, value] of Object.entries(style ?? {})) {
        if (prop === "background" || prop === "backgroundColor") continue;
        // skip junk keys in the upstream themes (one-light has an `Opacity`)
        if (/^[A-Z]/.test(prop) && !/^(Moz|Webkit|O)[A-Z]/.test(prop)) continue;
        out.push(`${kebab(prop)}:${value}`);
    }
    out.push("background:transparent");
    return out.join(";");
}

/**
 * Mirrors react-syntax-highlighter's inline mode: the pre gets
 * `pre[class*="language-"]`, the code gets `code[class*="language-"]`, and a
 * token gets every key named after its classes (`keyword`, `class-name`, ...).
 * Compound selector keys (`.language-css .token.string`) were never applied
 * inline, so they're skipped here too. Rules are unlayered, so like the old
 * inline styles they win over the Tailwind utilities on the card.
 */
function themeCss(sheet: Sheet, root: string) {
    const scope = `:root${root} .blog-code-block`;
    const rules = [
        `${scope} .prismjs{${declarations(sheet['pre[class*="language-"]'])}}`,
        `${scope} .prismjs>code{${declarations(sheet['code[class*="language-"]'])}}`,
    ];
    for (const [key, style] of Object.entries(sheet)) {
        if (!/^[a-z][\w-]*(\.[\w-]+)*$/i.test(key)) continue;
        rules.push(`${scope} .token.${key}{${declarations(style)}}`);
    }
    return rules.join("\n");
}

const CODE_THEME_CSS =
    themeCss(atomDark as Sheet, DARK_THEMES) + "\n" + themeCss(oneLight as Sheet, `:not(${DARK_THEMES})`);

// Tokens go out as one HTML string per block instead of a React tree: the RSC
// payload carries ~1.6k token spans as a string rather than as elements, and
// hydration doesn't have to walk them (there is nothing interactive inside).
type HastNode = {
    type: "element" | "text";
    value?: string | number;
    properties?: { className?: unknown[] };
    children?: HastNode[];
};

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toHtml(nodes: HastNode[]): string {
    let html = "";
    for (const node of nodes) {
        if (node.type === "text") {
            html += escapeHtml(String(node.value ?? ""));
            continue;
        }
        const inner = toHtml(node.children ?? []);
        const className = (node.properties?.className ?? []).join(" ");
        // plain-text runs come back as class-less spans; they style nothing
        html += className ? `<span class="${escapeHtml(className)}">${inner}</span>` : inner;
    }
    return html;
}

const renderTokens = ({ rows }: { rows: HastNode[] }) => (
    <span dangerouslySetInnerHTML={{ __html: toHtml(rows) }} />
);

// Per-render (per-request) flag: true for the first caller only.
const themeStyleState = cache(() => ({ emitted: false }));
function claimThemeStyle() {
    const state = themeStyleState();
    if (state.emitted) return false;
    state.emitted = true;
    return true;
}

interface CodeBlockProps {
    language: string;
    children: string;
}

export default function CodeBlock({ language, children }: CodeBlockProps) {
    const resolvedLanguage = LANGUAGE_ALIASES[language] ?? language;

    return (
        <div className="relative group my-8 blog-code-block">
            {/* React hoists this into <head>; emitted from the first block
                only, since every copy would also be serialised into the RSC
                payload (~12 kB x every block on the page). */}
            {claimThemeStyle() && (
                <style href="code-block-theme" precedence="default">
                    {CODE_THEME_CSS}
                </style>
            )}
            <SyntaxHighlighter
                useInlineStyles={false}
                language={resolvedLanguage}
                PreTag="div"
                codeTagProps={{ className: `language-${resolvedLanguage}` }}
                className="rounded-2xl border border-foreground/10 normal-case overflow-x-auto"
                wrapLines={false}
                renderer={renderTokens}
                customStyle={{
                    // Translucent, not a solid fill: the visible sky is the
                    // --bg-gradient, so any opaque colour (or a mix against the
                    // flat --background fallback) reads as a foreign card
                    // pasted on top. No backdrop-filter here: a 12px blur per
                    // visible code block was a full-viewport blur on every
                    // scroll frame for almost no visual difference over the
                    // smooth sky.
                    background: "color-mix(in srgb, var(--foreground) 8%, transparent)",
                    padding: "1.5rem",
                    margin: 0,
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                }}
            >
                {children}
            </SyntaxHighlighter>
        </div>
    );
}
