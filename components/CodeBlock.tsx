"use client";

import React from "react";
// PrismLight, not the full `Prism` build: the latter ships every registered
// language (cuda, verilog, smalltalk, ...) in one ~636 kB chunk. We register
// only the languages the posts actually fence.
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ebnf from "react-syntax-highlighter/dist/esm/languages/prism/ebnf";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import nasm from "react-syntax-highlighter/dist/esm/languages/prism/nasm";
import { useTheme } from "./ThemeProvider";

// Map the fence tags used in posts onto the registered grammars. Tags with no
// grammar (`txt`, `text`) or an unknown one fall through to plain text, which
// is exactly how PrismLight behaves for unregistered languages.
const LANGUAGE_ALIASES: Record<string, string> = {
    js: "javascript",
    sh: "bash",
    asm: "nasm",
};

SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("ebnf", ebnf);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("nasm", nasm);

interface CodeBlockProps {
    language: string;
    children: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, children }) => {
    const { theme } = useTheme();

    // Determine if we should use a light or dark style
    const isDark = ["moonlight", "starlight", "twilight"].includes(theme);
    const baseStyle = isDark ? atomDark : oneLight;
    const resolvedLanguage = LANGUAGE_ALIASES[language] ?? language;

    // Create a cleaned version of the style object where background
    // properties are forced to "transparent" without mixing shorthand properties.
    const cleanedStyle: { [key: string]: React.CSSProperties } = {};
    Object.keys(baseStyle).forEach((key) => {
        // Copy, then drop the shorthand so we can force a single transparent
        // fill without a shorthand/longhand mix.
        const entry = {
            ...(baseStyle as Record<string, React.CSSProperties>)[key],
        };
        delete entry.background;
        delete entry.backgroundColor;
        cleanedStyle[key] = {
            ...entry,
            background: "transparent",
        };
    });

    return (
        <div className="relative group my-8 blog-code-block">
            <SyntaxHighlighter
                style={cleanedStyle}
                language={resolvedLanguage}
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
