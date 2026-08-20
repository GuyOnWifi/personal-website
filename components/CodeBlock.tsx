"use client";

import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "./ThemeProvider";

interface CodeBlockProps {
    language: string;
    children: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, children }) => {
    const { theme } = useTheme();

    // Determine if we should use a light or dark style
    const isDark = ["moonlight", "starlight", "twilight"].includes(theme);
    const baseStyle = isDark ? atomDark : oneLight;

    // Create a cleaned version of the style object where background
    // properties are forced to "transparent" without mixing shorthand properties.
    const cleanedStyle: { [key: string]: React.CSSProperties } = {};
    Object.keys(baseStyle).forEach((key) => {
        const { background, backgroundColor, ...rest } = (baseStyle as any)[key];
        cleanedStyle[key] = {
            ...rest,
            background: "transparent",
        };
    });

    return (
        <div className="relative group my-8 blog-code-block">
            <SyntaxHighlighter
                style={cleanedStyle}
                language={language}
                PreTag="div"
                className="rounded-2xl border border-foreground/10 normal-case overflow-x-auto"
                wrapLines={false}
                customStyle={{
                    // Translucent, not a solid fill: the visible sky is the
                    // --bg-gradient, so any opaque colour (or a mix against the
                    // flat --background fallback) reads as a foreign card
                    // pasted on top. Tinting --foreground at low alpha and
                    // letting the backdrop-blur show the real gradient through
                    // keeps it in palette on every theme, light or dark.
                    background: "color-mix(in srgb, var(--foreground) 8%, transparent)",
                    backdropFilter: "blur(12px) saturate(120%)",
                    WebkitBackdropFilter: "blur(12px) saturate(120%)",
                    padding: "1.5rem",
                    margin: 0,
                    fontSize: "0.875rem",
                    lineHeight: 1.6,
                }}
            >
                {children}
            </SyntaxHighlighter>
        </div>
    );
};

export default CodeBlock;
