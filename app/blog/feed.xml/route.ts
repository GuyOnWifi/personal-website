import fs from "fs";
import path from "path";
import matter from "gray-matter";

export const dynamic = "force-static";

const SITE_URL = "https://easonhuang.dev";
const FEED_URL = `${SITE_URL}/blog/feed.xml`;

const escapeXml = (s: string) =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

function slugToTitle(slug: string) {
    return slug.split("_").join(" ");
}

export async function GET() {
    const publicDir = path.join(process.cwd(), "public");
    const posts = fs
        .readdirSync(publicDir)
        .filter((file) => file.endsWith(".md"))
        .map((file) => {
            const slug = file.replace(".md", "");
            const raw = fs.readFileSync(path.join(publicDir, file), "utf-8");
            const { data } = matter(raw);
            const stat = fs.statSync(path.join(publicDir, file));
            const date = data.date ? new Date(data.date as string) : stat.mtime;
            return {
                slug,
                title: (data.title as string) || slugToTitle(slug),
                description: (data.description as string) || "",
                date,
            };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());

    const items = posts
        .map(
            (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid>${SITE_URL}/blog/${p.slug}</guid>
      <description>${escapeXml(p.description)}</description>
      <pubDate>${p.date.toUTCString()}</pubDate>
    </item>`
        )
        .join("\n");

    const lastBuild = posts[0]?.date.toUTCString() ?? new Date(0).toUTCString();

    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>eason huang — blog</title>
    <link>${SITE_URL}/blog</link>
    <description>posts by eason huang on software, ai/ml, and systems.</description>
    <language>en</language>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>`;

    return new Response(xml, {
        headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
}
