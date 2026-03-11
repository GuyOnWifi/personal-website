import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { notFound } from "next/navigation";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const publicDir = path.join(process.cwd(), "public");
    const filePath = path.join(publicDir, `${slug}.md`);

    if (!fs.existsSync(filePath)) {
        return notFound();
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const title = slug.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

    return (
        <div className="min-h-screen bg-white py-20 prose prose-lg max-w-none">
            <div className="max-w-3xl mx-auto px-6">
                <Link href="/blog" className="inline-flex items-center gap-2 text-gray-500 hover:text-[#283655] transition-colors mb-12 group no-underline">
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Blog</span>
                </Link>

                <header className="mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold text-[#283655] mb-6 leading-tight">
                        {title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-6 text-gray-500 border-b border-gray-100 pb-8">
                        <div className="flex items-center gap-2">
                            <User size={18} />
                            <span>Eason Huang</span>
                        </div>
                    </div>
                </header>

                <article className="blog-content">
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        .katex {
                            color: #1a1a1b !important;
                        }
                    ` }} />
                    <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={{
                            h1: ({ ...props }) => <h1 className="text-3xl font-bold text-[#283655] mt-12 mb-6" {...props} />,
                            h2: ({ ...props }) => <h2 className="text-2xl font-bold text-[#283655] mt-10 mb-4" {...props} />,
                            h3: ({ ...props }) => <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4" {...props} />,
                            p: ({ ...props }) => <p className="text-gray-700 leading-relaxed mb-6" {...props} />,
                            ul: ({ ...props }) => <ul className="list-disc list-inside mb-6 space-y-2 text-gray-700" {...props} />,
                            ol: ({ ...props }) => <ol className="list-decimal list-inside mb-6 space-y-2 text-gray-700" {...props} />,
                            li: ({ ...props }) => <li className="ml-4" {...props} />,
                            code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
                                const match = /language-(\w+)/.exec(className || "");
                                return match ? (
                                    <SyntaxHighlighter
                                        style={oneLight}
                                        language={match[1]}
                                        PreTag="div"
                                        className="rounded-2xl my-8 border border-gray-200"
                                        wrapLines={true}
                                        {...props}
                                    >
                                        {String(children).replace(/\n$/, "")}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code className="bg-gray-100 rounded px-1 py-0.5 font-mono text-sm text-[#b3a8d6]" {...props}>
                                        {children}
                                    </code>
                                );
                            },
                            pre: ({ ...props }: { children?: React.ReactNode }) => <>{props.children}</>,
                            blockquote: ({ ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
                                <blockquote className="border-l-4 border-[#b3a8d6] pl-6 py-2 italic text-gray-600 my-8 bg-gray-50 rounded-r-lg" {...props} />
                            ),
                            img: ({ ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
                                <span className="block my-10">
                                    <img className="rounded-2xl shadow-lg w-full" {...props} alt={props.alt || "Blog image"} />
                                    {props.alt && <span className="block text-center text-sm text-gray-500 mt-4 italic">{props.alt}</span>}
                                </span>
                            ),
                            a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a className="text-[#b3a8d6] hover:text-[#283655] transition-colors underline" {...props} />,
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                </article>

                <div className="mt-20 pt-12 border-t border-gray-100 flex justify-between items-center">
                    <Link href="/blog" className="text-[#b3a8d6] font-semibold hover:text-[#283655] transition-colors">
                        ← View all posts
                    </Link>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-400 font-medium italic">Thanks for reading!</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
