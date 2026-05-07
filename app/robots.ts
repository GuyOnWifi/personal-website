import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://easonhuang.dev/sitemap.xml",
    host: "https://easonhuang.dev",
  };
}
