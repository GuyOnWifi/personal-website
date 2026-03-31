"use client";

import ThemeToggle from "./ThemeToggle";
import Link from "next/link";
import { motion } from "framer-motion";

const navItems = [
    { name: "about", href: "#about" },
    { name: "projects", href: "#projects" },
    { name: "writing", href: "#writing" },
];

export default function Navigation() {
    return (
        <nav className="flex items-center justify-between py-8 px-4 max-w-2xl mx-auto w-full">
            <Link href="/" className="font-bold text-xl tracking-tight">
                eason huang
            </Link>

            <div className="flex items-center gap-6">
                <div className="hidden sm:flex gap-6">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="hover:text-accent transition-colors border-b border-transparent hover:border-accent"
                        >
                            {item.name}
                        </Link>
                    ))}
                </div>
                <ThemeToggle />
            </div>
        </nav>
    );
}
