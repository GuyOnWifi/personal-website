"use client";

import { motion } from "framer-motion";

export default function Footer() {
    return (
        <footer className="max-w-2xl mx-auto w-full px-4 py-12 border-t border-foreground/10 mt-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-sm opacity-50">
                    2026 © eason huang
                </div>

                <div className="font-signature text-3xl opacity-80 select-none">
                    Eason Huang
                </div>

                <div className="flex gap-4 opacity-50 hover:opacity-100 transition-opacity items-center">
                    <a href="https://github.com/guyonwifi" target="_blank" rel="noreferrer" className="hover:text-accent font-medium">gh</a>
                    <a href="mailto:easonh887@gmail.com" className="hover:text-accent font-medium">ml</a>
                    <a href="https://linkedin.com/in/easonhuang-" target="_blank" rel="noreferrer" className="hover:text-accent font-medium">in</a>
                </div>
            </div>
        </footer>
    );
}
