import type { Metadata } from "next";
import { Geist, Geist_Mono, Dancing_Script } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import AuroraLayer from "@/components/AuroraLayer";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dancingScript = Dancing_Script({
  variable: "--font-signature",
  subsets: ["latin"],
});

const SITE_URL = "https://easonhuang.dev";
const SITE_NAME = "eason huang";
const SITE_DESCRIPTION =
  "software engineer working on full-stack and ai/ml. currently at nokia, previously factful and eurekahacks.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "eason huang",
    template: "%s by eason huang",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "eason huang", url: SITE_URL }],
  creator: "eason huang",
  keywords: [
    "eason huang",
    "software engineer",
    "full-stack",
    "ai",
    "ml",
    "nokia",
    "factful",
    "eurekahacks",
  ],
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": [
        { url: "/blog/feed.xml", title: "eason huang — blog" },
        { url: "https://notes.easonhuang.dev/index.xml", title: "eason huang — notes" },
      ],
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "eason huang",
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "eason huang" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "eason huang",
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
    creator: "@guyonwifi",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="moonlight">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'moonlight';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dancingScript.variable} antialiased selection:bg-accent selection:text-background`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: "eason huang",
              url: SITE_URL,
              email: "me@easonhuang.dev",
              jobTitle: "software engineer",
              sameAs: [
                "https://github.com/guyonwifi",
                "https://linkedin.com/in/easonhuang-",
              ],
            }),
          }}
        />
        <ThemeProvider>
          <AuroraLayer />
          <div className="relative z-0 min-h-screen max-w-2xl mx-auto px-4 flex flex-col">
            <Navigation />
            <main className="flex-grow">
              {children}
            </main>
            <Footer />
          </div>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
