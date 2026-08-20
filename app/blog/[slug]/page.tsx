import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSidenotes from "@/lib/rehypeSidenotes";
import "katex/dist/katex.min.css";
import CodeBlock from "@/components/CodeBlock";
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

interface PostMeta {
    title?: string;
    description?: string;
    date?: string;
    tags?: string[];
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
    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
            type: "article",
            url,
            title: `${title} by eason huang`,
            description,
            authors: ["eason huang"],
            publishedTime: meta.date,
            tags: meta.tags,
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} by eason huang`,
            description,
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
            <header className="mb-16">
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight">
                    {title}
                </h1>
                {description && (
                    <p className="text-lg opacity-70 mb-6 leading-relaxed">{description}</p>
                )}
                <div className="flex flex-wrap items-center gap-6 opacity-50 border-b border-foreground/10 pb-8">
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
                    rehypePlugins={[rehypeRaw, rehypeSidenotes, rehypeKatex]}
                    components={{
                        h1: ({ ...props }) => <h1 className="text-3xl font-bold text-foreground mt-12 mb-6" {...props} />,
                        h2: ({ ...props }) => <h2 className="text-2xl font-bold text-foreground mt-10 mb-4" {...props} />,
                        h3: ({ ...props }) => <h3 className="text-xl font-bold text-foreground mt-8 mb-4" {...props} />,
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
                                <code className="bg-foreground/10 rounded px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>
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
                            <div className="my-8 overflow-x-auto rounded-xl border border-foreground/10">
                                <table className="w-full border-collapse text-sm" {...props} />
                            </div>
                        ),
                        thead: ({ ...props }) => (
                            <thead className="border-b border-foreground/15" {...props} />
                        ),
                        tr: ({ ...props }) => (
                            <tr className="border-b border-foreground/5 last:border-0" {...props} />
                        ),
                        th: ({ ...props }) => (
                            <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap" {...props} />
                        ),
                        td: ({ ...props }) => (
                            <td className="px-4 py-2.5 align-top" {...props} />
                        ),
                        blockquote: ({ ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
                            <blockquote className="border-l-4 border-accent pl-6 py-2 italic opacity-80 my-8 bg-foreground/[0.02] rounded-r-lg" {...props} />
                        ),
                        img: ({ ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
                            <span className="block my-10">
                                <img className="rounded-2xl shadow-lg w-full" {...props} alt={props.alt || "Blog image"} />
                                {props.alt && <span className="block text-center text-sm opacity-50 mt-4 italic">{props.alt}</span>}
                            </span>
                        ),
                        a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a className="text-accent hover:underline transition-colors" {...props} />,
                    }}
                >
                    {content}
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
