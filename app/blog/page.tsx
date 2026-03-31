import fs from "fs";
import path from "path";
import Link from "next/link";
import { BookOpen } from "lucide-react";

export default async function BlogListPage() {
    const publicDir = path.join(process.cwd(), "public");
    const files = fs.readdirSync(publicDir);
    const blogs = files
        .filter((file) => file.endsWith(".md"))
        .map((file) => ({
            slug: file.replace(".md", ""),
            title: file.replace(".md", "").split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" "),
            fileName: file,
        }));

    return (
        <div className="py-12 pb-24">
            <div className="mb-12">
                <h1 className="text-4xl font-bold flex items-center gap-3">
                    <BookOpen className="text-accent" size={36} />
                    writing
                </h1>
                <div className="w-20 h-1 bg-accent mt-4 rounded-full"></div>
                <p className="opacity-70 mt-6">
                    reflections on software engineering, deep learning, and everything in between.
                </p>
            </div>

            <div className="space-y-6">
                {blogs.map((blog) => (
                    <Link
                        key={blog.slug}
                        href={`/blog/${blog.slug}`}
                        className="block group"
                    >
                        <div className="bg-foreground/[0.03] p-8 rounded-2xl border border-foreground/5 hover:border-accent/20 transition-all group-hover:-translate-y-1">
                            <h2 className="text-2xl font-bold group-hover:text-accent transition-colors">
                                {blog.title}
                            </h2>
                            <div className="mt-4 flex items-center gap-4 text-sm opacity-50">
                                <span className="flex items-center gap-1">
                                    read article
                                </span>
                            </div>
                        </div>
                    </Link>
                ))}

                {blogs.length === 0 && (
                    <div className="text-center py-20 opacity-50 italic">
                        no blog posts found yet. check back soon!
                    </div>
                )}
            </div>
        </div>
    );
}
