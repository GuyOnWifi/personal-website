"use client";

import React from "react";
import ThemeToggle from "./ThemeToggle";
import Link from "next/link";

const navItems = [
    { name: "about", href: "/" },
    // { name: "projects", href: "/" },
    { name: "blogs", href: "/blog" },
    { name: "notes", href: "https://notes.easonhuang.dev", external: true },
];

export default function Navigation() {
    return (
        <nav className="flex items-center justify-between py-8 w-full">
            <Link href="/" className="font-bold text-3xl tracking-tight">
                eason huang
            </Link>

            <div className="flex items-center gap-6">
                <div className="hidden sm:flex gap-6">
                    {navItems.map((item) =>
                        item.external ? (
                            <a
                                key={item.href}
                                href={item.href}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-accent transition-colors border-b border-transparent hover:border-accent"
                            >
                                {item.name}
                            </a>
                        ) : (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="hover:text-accent transition-colors border-b border-transparent hover:border-accent"
                            >
                                {item.name}
                            </Link>
                        )
                    )}
                </div>
                <ThemeToggle />
            </div>
        </nav>
    );
}
