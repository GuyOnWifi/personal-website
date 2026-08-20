import type { Element, ElementContent, Parent, Root } from "hast";

/**
 * Turns GFM footnotes (`[^1]` … `[^1]: note`) into Tufte-style margin
 * sidenotes: the reference becomes a numbered <label>, and the definition is
 * inlined right there as a floating <span class="sidenote">. The footnote
 * section at the bottom of the post is dropped.
 *
 * Markup mirrors tufte.css so the hidden checkbox can toggle the note open on
 * narrow screens with no JS:
 *   <label class="margin-toggle sidenote-number" for="sn-x" />
 *   <input class="margin-toggle" type="checkbox" id="sn-x" />
 *   <span class="sidenote">…</span>
 *
 * Numbering is a CSS counter (document order), not the GFM definition order.
 */

const isElement = (node: unknown): node is Element =>
    !!node && (node as Element).type === "element";

function walk(node: Parent, visit: (child: ElementContent, index: number, parent: Parent) => void) {
    const children = node.children as ElementContent[];
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        visit(child, i, node);
        if (child && "children" in child && Array.isArray(child.children)) {
            walk(child as unknown as Parent, visit);
        }
    }
}

/** Drops the "↩" backref link remark-gfm appends to every definition. */
function stripBackrefs(nodes: ElementContent[]): ElementContent[] {
    return nodes
        .filter((n) => !(isElement(n) && "dataFootnoteBackref" in (n.properties ?? {})))
        .map((n) => {
            if (isElement(n) && n.children?.length) {
                return { ...n, children: stripBackrefs(n.children as ElementContent[]) };
            }
            return n;
        });
}

/**
 * A sidenote lives inside a <p>, so nested <p> would be invalid HTML (and a
 * hydration mismatch). Single-paragraph notes get unwrapped; longer ones keep
 * their paragraphs as block-level spans.
 */
function inlineable(children: ElementContent[]): ElementContent[] {
    const blocks = children.filter((n) => !(n.type === "text" && !n.value.trim()));
    if (blocks.length === 1 && isElement(blocks[0]) && blocks[0].tagName === "p") {
        return blocks[0].children as ElementContent[];
    }
    return blocks.map((n) =>
        isElement(n) && n.tagName === "p"
            ? { ...n, tagName: "span", properties: { ...n.properties, className: ["sidenote-para"] } }
            : n,
    );
}

export default function rehypeSidenotes() {
    return (tree: Root) => {
        const definitions = new Map<string, ElementContent[]>();
        const footnoteSections: Array<{ parent: Parent; node: ElementContent }> = [];

        // pass 1 — harvest the definitions, remember the section to delete
        walk(tree as unknown as Parent, (node, _index, parent) => {
            if (!isElement(node) || node.tagName !== "section") return;
            if (!("dataFootnotes" in (node.properties ?? {}))) return;
            footnoteSections.push({ parent, node });

            walk(node as unknown as Parent, (item) => {
                if (!isElement(item) || item.tagName !== "li") return;
                const id = item.properties?.id;
                if (typeof id !== "string") return;
                definitions.set(id, inlineable(stripBackrefs(item.children as ElementContent[])));
            });
        });

        if (!definitions.size) return;

        // pass 2 — swap each <sup><a data-footnote-ref> for the sidenote trio
        walk(tree as unknown as Parent, (node, index, parent) => {
            if (!isElement(node) || node.tagName !== "sup") return;
            const anchor = node.children?.find(
                (c) => isElement(c) && "dataFootnoteRef" in (c.properties ?? {}),
            );
            if (!isElement(anchor)) return;

            const href = anchor.properties?.href;
            if (typeof href !== "string") return;
            const content = definitions.get(href.replace(/^#/, ""));
            if (!content) return;

            const toggleId = `sn-${href.replace(/^#/, "")}`;
            const replacement: ElementContent[] = [
                {
                    type: "element",
                    tagName: "label",
                    properties: { htmlFor: toggleId, className: ["margin-toggle", "sidenote-number"] },
                    children: [],
                },
                {
                    type: "element",
                    tagName: "input",
                    properties: { type: "checkbox", id: toggleId, className: ["margin-toggle"] },
                    children: [],
                },
                {
                    type: "element",
                    tagName: "span",
                    properties: { className: ["sidenote"] },
                    children: content,
                },
            ];
            (parent.children as ElementContent[]).splice(index, 1, ...replacement);
        });

        for (const { parent, node } of footnoteSections) {
            const at = (parent.children as ElementContent[]).indexOf(node);
            if (at !== -1) (parent.children as ElementContent[]).splice(at, 1);
        }
    };
}
