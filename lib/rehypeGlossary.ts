import type { Element, ElementContent, Parent, Root, Text } from "hast";

/**
 * Hover definitions for jargon. A post lists its terms in front matter:
 *
 *   glossary:
 *     TTFT: time to first token: ...
 *     KV cache: ...
 *
 * and the first use of each term in every h2 section is wrapped in
 *   <span data-term="TTFT" data-def="...">TTFT</span>
 * which the page maps to a <GlossaryTerm> tooltip. Matching is
 * case-insensitive, whole-word at the start, and takes trailing letters
 * along ("prefills", "decoded"). Code, links, headings and math are skipped.
 */

const SKIP = new Set(["code", "pre", "a", "h1", "h2", "h3", "h4", "h5", "h6", "script", "style", "svg", "label", "input"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isElement = (node: unknown): node is Element =>
    !!node && (node as Element).type === "element";

function skipped(el: Element) {
    if (SKIP.has(el.tagName)) return true;
    const cls = el.properties?.className;
    const classes = Array.isArray(cls) ? cls.map(String) : typeof cls === "string" ? cls.split(" ") : [];
    return classes.some((c) => c.startsWith("katex") || c.startsWith("math"));
}

export default function rehypeGlossary(options: { terms?: Record<string, string> } = {}) {
    const entries = Object.entries(options.terms ?? {});
    return (tree: Root) => {
        if (!entries.length) return;
        // longest first so "KV cache" wins over a shorter overlapping term
        const keys = entries.map(([k]) => k).sort((a, b) => b.length - a.length);
        const lookup = new Map(entries.map(([k, v]) => [k.toLowerCase(), { key: k, def: v }]));
        const pattern = new RegExp(`\\b(${keys.map(escape).join("|")})[a-z]*`, "gi");
        let seen = new Set<string>();

        const wrapText = (node: Text): ElementContent[] | null => {
            const out: ElementContent[] = [];
            let last = 0;
            let changed = false;
            pattern.lastIndex = 0;
            for (let m = pattern.exec(node.value); m; m = pattern.exec(node.value)) {
                const hit = lookup.get(m[1].toLowerCase());
                if (!hit || seen.has(hit.key)) continue;
                seen.add(hit.key);
                changed = true;
                if (m.index > last) out.push({ type: "text", value: node.value.slice(last, m.index) });
                out.push({
                    type: "element",
                    tagName: "span",
                    properties: { dataTerm: hit.key, dataDef: hit.def },
                    children: [{ type: "text", value: m[0] }],
                });
                last = m.index + m[0].length;
            }
            if (!changed) return null;
            if (last < node.value.length) out.push({ type: "text", value: node.value.slice(last) });
            return out;
        };

        const walk = (parent: Parent) => {
            const children = parent.children as ElementContent[];
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.type === "text") {
                    const replaced = wrapText(child);
                    if (replaced) {
                        children.splice(i, 1, ...replaced);
                        i += replaced.length - 1;
                    }
                } else if (isElement(child)) {
                    // a new section: each term gets defined again on first use
                    if (child.tagName === "h2") seen = new Set();
                    if (!skipped(child)) walk(child);
                }
            }
        };
        walk(tree);
    };
}
