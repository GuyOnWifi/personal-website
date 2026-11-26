import fs from "fs";
import path from "path";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSidenotes from "@/lib/rehypeSidenotes";
import rehypeGlossary from "@/lib/rehypeGlossary";
import GlossaryTerm from "@/components/GlossaryTerm";
import "katex/dist/katex.min.css";
import CodeBlock from "@/components/CodeBlock";
import BlogVideo from "@/components/BlogVideo";
import BlogImage from "@/components/BlogImage";
import SvgWindow from "@/components/SvgWindow";
import RooflineExplorer from "@/components/RooflineExplorer";
import ChartGallery from "@/components/ChartGallery";
import ChartPeek from "@/components/ChartPeek";
import BlogToc, { type TocItem } from "@/components/BlogToc";
import Link from "next/link";
import { User } from "lucide-react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import matter from "gray-matter";

function slugToTitle(slug: string) {
    return slug
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/**
 * Intrinsic image sizes, keyed by src, written by the writeup converter.
 * Optional: posts whose images are remote (or predate the manifest) just render
 * without width/height, exactly as before.
 */
function loadImageSizes(): Record<string, { w: number; h: number }> {
    const manifest = path.join(process.cwd(), "public", "matmul", "dimensions.json");
    if (!fs.existsSync(manifest)) return {};
    try {
        return JSON.parse(fs.readFileSync(manifest, "utf-8"));
    } catch {
        return {};
    }
}
const imageSizes = loadImageSizes();

/**
 * react-markdown hands every component override its hast `node`. The overrides
 * below spread their props onto host elements, which renders
 * node="[object Object]" on every tag and, worse, serialises each element's
 * whole hast subtree into the RSC payload (quadratic in nesting depth: the
 * KaTeX blocks alone were most of a ~1 MB payload). Strip it once here.
 */
function withoutNode(components: Components): Components {
    const out: Record<string, unknown> = {};
    for (const [tag, Comp] of Object.entries(components)) {
        if (typeof Comp !== "function") {
            out[tag] = Comp;
            continue;
        }
        const render = Comp as (props: Record<string, unknown>) => React.ReactNode;
        out[tag] = (props: Record<string, unknown>) => {
            const { node, ...rest } = props;
            void node;
            return render(rest);
        };
    }
    return out as Components;
}

/** Heading text -> URL fragment id. */
function slugify(text: string) {
    return (
        text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-") || "section"
    );
}

function plainText(node: React.ReactNode): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(plainText).join("");
    if (typeof node === "object" && "props" in node) {
        return plainText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
    }
    return "";
}

const normalize = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * h2/h3 headings from the Markdown source (skipping fenced code), with unique
 * ids. The h2/h3 overrides look their id up by text, so the rail and the
 * anchors always agree.
 */
function extractToc(markdown: string): TocItem[] {
    const items: TocItem[] = [];
    const seen = new Map<string, number>();
    let fence = false;
    for (const line of markdown.split("\n")) {
        if (/^\s*(```|~~~)/.test(line)) fence = !fence;
        if (fence) continue;
        const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
        if (!m) continue;
        const text = normalize(
            m[2]
                .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
                .replace(/[`*_]/g, "")
        );
        const base = slugify(text);
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        items.push({ id: n ? `${base}-${n}` : base, text, depth: m[1].length as 2 | 3 });
    }
    return items;
}

interface PostMeta {
    title?: string;
    image?: string;
    description?: string;
    date?: string;
    tags?: string[];
    /** term -> one-line definition, shown on hover (lib/rehypeGlossary.ts) */
    glossary?: Record<string, string>;
}

export async function generateStaticParams() {
    const publicDir = path.join(process.cwd(), "public");
    return fs
        .readdirSync(publicDir)
        .filter((file) => file.endsWith(".md"))
        .map((file) => ({ slug: file.replace(".md", "") }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const filePath = path.join(process.cwd(), "public", `${slug}.md`);
    if (!fs.existsSync(filePath)) {
        return { title: "not found" };
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    const meta = data as PostMeta;
    const title = meta.title || slugToTitle(slug).toLowerCase();
    const description =
        meta.description ||
        content
            .replace(/[#>*_`]/g, "")
            .replace(/[–—]/g, ",")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160) ||
        `${title}. a post by eason huang.`;
    const url = `/blog/${slug}`;
    const ogImage = meta.image || "/og.png";
    return {
        title,
        description,
        alternates: { canonical: url },
        // Next replaces these blocks rather than merging them, so the image and
        // handle from the root layout have to be restated here or posts unfurl
        // as a bare text card. `image` in frontmatter overrides per post.
        openGraph: {
            type: "article",
            url,
            title: `${title} by eason huang`,
            description,
            authors: ["eason huang"],
            publishedTime: meta.date,
            tags: meta.tags,
            images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} by eason huang`,
            description,
            images: [ogImage],
            creator: "@guyonwifi",
        },
    };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const publicDir = path.join(process.cwd(), "public");
    const filePath = path.join(publicDir, `${slug}.md`);

    if (!fs.existsSync(filePath)) {
        return notFound();
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    const meta = data as PostMeta;
    const title = meta.title || slugToTitle(slug);
    const description = meta.description;
    // A bare <video> inside Markdown is phrasing content, so react-markdown
    // wraps it in a <p>; mapping it to the block-level player then produces
    // invalid p > figure markup (and a hydration mismatch). Turn it into a
    // block-level marker before parsing so the player mounts as a sibling.
    const renderedContent = content.replace(
        /<video\b([^>]*)>\s*<\/video>/gi,
        (_match, attrs: string) => `<div data-blog-video${attrs}></div>`
    );
    const toc = extractToc(content);
    // text -> ids in document order (duplicates are consumed in turn)
    const tocIds = new Map<string, string[]>();
    for (const it of toc) tocIds.set(it.text, [...(tocIds.get(it.text) ?? []), it.id]);
    const headingId = (children: React.ReactNode) => {
        const text = normalize(plainText(children));
        return tocIds.get(text)?.shift() ?? slugify(text);
    };
    const stat = fs.statSync(filePath);
    const publishedISO = meta.date ? new Date(meta.date).toISOString() : stat.birthtime.toISOString();
    const publishedDate = new Date(publishedISO);
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description,
        author: { "@type": "Person", name: "eason huang", url: "https://easonhuang.dev" },
        datePublished: publishedISO,
        dateModified: stat.mtime.toISOString(),
        keywords: meta.tags,
        mainEntityOfPage: `https://easonhuang.dev/blog/${slug}`,
    };

    return (
        <div className="py-12 pb-24 prose prose-invert max-w-none">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <BlogToc items={toc} />
            <header className="mb-16">
                {/* the title may run past both sides of the text column on wide screens so it sits on one line */}
                <h1 className="text-4xl md:text-5xl xl:-mx-28 font-bold text-foreground mb-6 leading-tight text-center">
                    {title}
                </h1>
                {description && (
                    <p className="text-lg opacity-70 mb-6 leading-relaxed text-center">{description}</p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-6 opacity-50 border-b border-foreground/10 pb-8">
                    <div className="flex items-center gap-2">
                        <User size={18} />
                        <span>eason huang</span>
                    </div>
                    {meta.date && (
                        <time dateTime={publishedISO}>
                            {publishedDate.toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            }).toLowerCase()}
                        </time>
                    )}
                </div>
            </header>

            <article className="blog-content text-foreground/90">
                <style dangerouslySetInnerHTML={{
                    __html: `.katex { color: inherit !important; }`,
                }} />
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeSidenotes, [rehypeGlossary, { terms: meta.glossary }], rehypeKatex]}
                    components={withoutNode({
                        h1: ({ ...props }) => <h1 className="text-3xl font-bold text-foreground mt-12 mb-6" {...props} />,
                        h2: ({ ...props }) => <h2 id={headingId(props.children)} className="text-2xl font-bold text-foreground mt-10 mb-4 scroll-mt-8" {...props} />,
                        h3: ({ ...props }) => <h3 id={headingId(props.children)} className="text-xl font-bold text-foreground mt-8 mb-4 scroll-mt-8" {...props} />,
                        p: ({ ...props }) => <p className="leading-relaxed mb-6" {...props} />,
                        ul: ({ ...props }) => <ul className="list-disc list-inside mb-6 space-y-2" {...props} />,
                        ol: ({ ...props }) => <ol className="list-decimal list-inside mb-6 space-y-2" {...props} />,
                        li: ({ ...props }) => <li className="ml-4" {...props} />,
                        code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
                            const match = /language-(\w+)/.exec(className || "");
                            return match ? (
                                <CodeBlock language={match[1]}>
                                    {String(children).replace(/\n$/, "")}
                                </CodeBlock>
                            ) : (
                                <code className="bg-foreground/10 rounded px-1.5 py-0.5 font-mono text-[0.85em] break-words" {...props}>
                                    {children}
                                </code>
                            );
                        },
                        // fenced code returns its own CodeBlock card, so the wrapping
                        // <pre> just passes through (no nested card/background).
                        pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
                        // GFM tables: wide ones (the benchmark results) scroll
                        // inside their own box so the page never scrolls sideways.
                        table: ({ ...props }) => (
                            <div className="blog-wide my-8 overflow-x-auto">
                                {/* separate borders so the body's corner cells can be rounded */}
                                <table className="w-full border-separate border-spacing-0 text-base" {...props} />
                            </div>
                        ),
                        // opaque, zebra-striped body; its bottom corners close the rounded box.
                        tbody: ({ ...props }) => (
                            <tbody
                                className="[&>tr:last-child>td:first-child]:rounded-bl-xl [&>tr:last-child>td:last-child]:rounded-br-xl [&>tr:nth-child(even)>td]:bg-[color-mix(in_oklab,var(--background),var(--foreground)_9%)]"
                                {...props}
                            />
                        ),
                        // the header row is the top band of the same rounded box as the body,
                        // with a stronger fill and a line under it.
                        th: ({ ...props }) => (
                            <th
                                className="border-y border-foreground/20 bg-[color-mix(in_oklab,var(--background),var(--foreground)_12%)] px-4 py-3 text-center font-bold whitespace-nowrap first:rounded-tl-xl first:border-l first:text-left last:rounded-tr-xl last:border-r"
                                {...props}
                            />
                        ),
                        td: ({ ...props }) => (
                            <td className="border-b border-foreground/20 bg-[color-mix(in_oklab,var(--background),var(--foreground)_4%)] px-4 py-2.5 text-center align-top first:border-l first:text-left last:border-r" {...props} />
                        ),
                        blockquote: ({ ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
                            <blockquote className="border-l-4 border-accent pl-6 py-2 italic opacity-80 my-8 bg-foreground/[0.02] rounded-r-lg" {...props} />
                        ),
                        img: ({ ...props }: React.ImgHTMLAttributes<HTMLImageElement> & {
                            "data-no-caption"?: string;
                        }) => {
                            // Intrinsic size, when we know it, lets the browser
                            // reserve the right box before the image arrives --
                            // otherwise a 25-figure post reflows 25 times.
                            const src = typeof props.src === "string" ? props.src : undefined;
                            const size = src ? imageSizes[src] : undefined;
                            const width = size?.w ?? (props.width ? Number(props.width) : undefined);
                            const height = size?.h ?? (props.height ? Number(props.height) : undefined);
                            return (
                                <BlogImage
                                    src={src}
                                    alt={props.alt}
                                    width={width}
                                    height={height}
                                    caption={props["data-no-caption"] === undefined}
                                />
                            );
                        },
                        // Raw HTML escape hatch for video markers. Anything else
                        // passes through as a normal div so posts can still use
                        // plain HTML when they need it.
                        div: ({ ...props }: React.HTMLAttributes<HTMLDivElement> & {
                            "data-blog-video"?: string;
                            "data-svg-window"?: string;
                            "data-caption"?: string;
                            "data-poster"?: string;
                            "data-aspect"?: string;
                            "data-chart-gallery"?: string;
                            "data-roofline"?: string;
                            src?: string;
                            poster?: string;
                        }) => {
                            if (props["data-blog-video"] !== undefined) {
                                return <BlogVideo src={props.src} poster={props.poster} />;
                            }
                            if (props["data-roofline"] !== undefined) {
                                return <RooflineExplorer />;
                            }
                            if (props["data-chart-gallery"] !== undefined) {
                                return <ChartGallery>{props.children}</ChartGallery>;
                            }
                            const board = props["data-svg-window"];
                            if (board) {
                                return (
                                    <SvgWindow
                                        src={`/gpu_matmul/boards/${board}.svg`}
                                        poster={props["data-poster"] ?? ""}
                                        caption={props["data-caption"]}
                                        aspect={props["data-aspect"] ?? "16 / 9"}
                                    />
                                );
                            }
                            return <div {...props} />;
                        },
                        // Chart icon in a table header: <span data-chart="src" data-alt="title"></span>
                        // Glossary term (added by rehypeGlossary): <span data-term data-def="...">
                        span: ({ ...props }: React.HTMLAttributes<HTMLSpanElement> & {
                            "data-chart"?: string;
                            "data-alt"?: string;
                            "data-def"?: string;
                        }) => {
                            const chart = props["data-chart"];
                            if (chart) return <ChartPeek src={chart} alt={props["data-alt"]} />;
                            const def = props["data-def"];
                            if (def) return <GlossaryTerm def={def}>{props.children}</GlossaryTerm>;
                            return <span {...props} />;
                        },
                        video: ({ src, poster }: React.VideoHTMLAttributes<HTMLVideoElement>) => (
                            <BlogVideo src={typeof src === "string" ? src : undefined} poster={poster} />
                        ),
                        a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a className="text-accent hover:underline transition-colors break-words" {...props} />,
                    })}
                >
                    {renderedContent}
                </ReactMarkdown>
            </article>

            <div className="mt-20 pt-12 border-t border-foreground/10 flex justify-between items-center">
                <Link href="/blog" className="text-accent font-semibold hover:underline transition-colors">
                    ← view all posts
                </Link>
                <div className="flex items-center gap-4">
                    <span className="text-sm opacity-40 font-medium italic">thanks for reading!</span>
                </div>
            </div>
        </div>
    );
}
