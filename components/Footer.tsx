"use client";

import { motion } from "framer-motion";
import { Github, Mail, Linkedin, BookOpen } from "lucide-react";
import Link from "next/link";

export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="w-full bg-white border-t border-gray-100 py-12">
            <div className="max-w-5xl mx-auto px-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex flex-col items-center md:items-start space-y-4">
                        <h3 className="text-xl font-bold text-[#283655]">Eason Huang</h3>
                        <p className="text-gray-500 text-sm max-w-xs text-center md:text-left">
                            Software Engineer & Computer Science student at the University of Waterloo.
                        </p>
                    </div>

                    <div className="flex flex-col items-center md:items-end space-y-6">
                        <div className="flex items-center gap-6">
                            <a
                                href="https://github.com/guyonwifi"
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-400 hover:text-[#283655] transition-colors"
                                aria-label="GitHub"
                            >
                                <Github size={24} />
                            </a>
                            <a
                                href="mailto:me@easonhuang.dev"
                                className="text-gray-400 hover:text-[#b3a8d6] transition-colors"
                                aria-label="Email"
                            >
                                <Mail size={24} />
                            </a>
                            <Link
                                href="/blog"
                                className="flex items-center gap-2 text-[#b3a8d6] font-semibold hover:text-[#283655] transition-colors group"
                            >
                                <BookOpen size={20} className="group-hover:scale-110 transition-transform" />
                                <span>Visit Blog</span>
                            </Link>
                        </div>

                        <p className="text-gray-400 text-xs">
                            © {currentYear} Eason Huang. Built with Next.js & Framer Motion.
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}
