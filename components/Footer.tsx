"use client";

import React from "react";
import { Mail } from "lucide-react";

export default function Footer() {
    return (
        <footer className="max-w-2xl mx-auto w-full px-4 py-12 border-t border-foreground/10 mt-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 uppercase tracking-widest text-[10px]">
                <div className="opacity-50">
                    2026 © eason huang
                </div>

                <div className="hidden md:block font-signature text-3xl opacity-80 select-none normal-case tracking-normal">
                    a guy on wifi
                </div>

                <div className="flex gap-6 opacity-50 hover:opacity-100 transition-opacity items-center">
                    <a href="https://github.com/guyonwifi" target="_blank" rel="noreferrer" className="hover:text-accent transition-all hover:scale-110">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.28 1.15-.28 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
                    </a>
                    <a href="mailto:me@easonhuang.dev" className="hover:text-accent transition-all hover:scale-110">
                        <Mail size={14} />
                    </a>
                    <a href="https://linkedin.com/in/easonhuang-" target="_blank" rel="noreferrer" className="hover:text-accent transition-all hover:scale-110">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect width="4" height="12" x="2" y="9"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                    </a>
                </div>
            </div>
        </footer>
    );
}
