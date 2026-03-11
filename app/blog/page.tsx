import fs from "fs";
import path from "path";
import Link from "next/link";
import { BookOpen, ArrowLeft } from "lucide-react";

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
        <div className="min-h-screen bg-gray-50 py-20">
            <div className="max-w-3xl mx-auto px-6">
                <div className="mb-12">
                    <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-[#283655] transition-colors mb-8 group">
                        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        <span>Back to Home</span>
                    </Link>
                    <h1 className="text-4xl font-bold text-[#283655] flex items-center gap-3">
                        <BookOpen className="text-[#b3a8d6]" size={36} />
                        My Blog
                    </h1>
                    <div className="w-20 h-1 bg-[#b3a8d6] mt-4 rounded-full"></div>
                    <p className="text-gray-600 mt-6">
                        Reflections on software engineering, deep learning, and everything in between.
                    </p>
                </div>

                <div className="space-y-6">
                    {blogs.map((blog) => (
                        <Link
                            key={blog.slug}
                            href={`/blog/${blog.slug}`}
                            className="block group"
                        >
                            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group-hover:-translate-y-1">
                                <h2 className="text-2xl font-bold text-gray-900 group-hover:text-[#b3a8d6] transition-colors">
                                    {blog.title}
                                </h2>
                                <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                        Read article
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}

                    {blogs.length === 0 && (
                        <div className="text-center py-20 text-gray-500 italic">
                            No blog posts found yet. Check back soon!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
