import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { MetadataRoute } from "next";

const SITE_URL = "https://easonhuang.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicDir = path.join(process.cwd(), "public");
  const posts = fs
    .readdirSync(publicDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const slug = file.replace(".md", "");
      const raw = fs.readFileSync(path.join(publicDir, file), "utf-8");
      const { data } = matter(raw);
      const stat = fs.statSync(path.join(publicDir, file));
      const lastModified = data.date ? new Date(data.date as string) : stat.mtime;
      return { slug, lastModified };
    });

  const now = new Date();

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
