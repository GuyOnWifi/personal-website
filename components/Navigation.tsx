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
        <nav className="flex flex-wrap items-center justify-between gap-y-3 py-5 w-full">
            <Link href="/" className="font-bold text-3xl tracking-tight whitespace-nowrap">
                eason huang
            </Link>

            {/* phones: name + toggle on top, links on their own row below */}
            <div className="contents sm:flex sm:items-center sm:gap-6">
                <div className="order-last flex w-full gap-6 sm:order-none sm:w-auto">
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
