"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import React from "react";

interface ExperienceItem {
    title: string;
    company: string;
    description?: React.ReactNode;
    icon?: string;
    link?: string;
    type: "job" | "project" | "header";
}

interface ExperienceListProps {
    items: ExperienceItem[];
    sectionTitle?: string;
}

export default function ExperienceList({ items, sectionTitle }: ExperienceListProps) {
    return (
        <section className="mb-8">
            {sectionTitle && (
                <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
                    <span className="text-accent animate-pulse">❄</span> {sectionTitle}
                </h2>
            )}

            <div className="space-y-3 ml-2">
                {items.map((item, index) => (
                    <motion.div
                        key={index}
                        // `animate`, not `whileInView`. This list is above the
                        // fold, and gating it on an IntersectionObserver meant
                        // the server-rendered opacity:0 could survive whenever
                        // the observer didn't fire, leaving the text invisible.
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="group"
                    >
                        {item.type === "header" ? (
                            <div className="italic text-sm opacity-80 mb-2">
                                {item.title}
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 text-sm mt-1">
                                <span className="opacity-40 group-hover:opacity-100 transition-opacity mt-1">↳</span>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="opacity-70">{item.title}</span>
                                        {item.icon && (
                                            <Image
                                                src={item.icon}
                                                alt={`${item.company || item.title} logo`}
                                                width={20}
                                                height={20}
                                                className="w-5 h-5 object-contain"
                                                unoptimized={item.icon.endsWith(".svg")}
                                            />
                                        )}
                                        {item.company && (() => {
                                            const isInternal = item.link?.startsWith("/");
                                            return (
                                                <a
                                                    href={item.link || "#"}
                                                    {...(isInternal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                                                    className="font-semibold underline decoration-foreground/20 decoration-1 underline-offset-4 hover:decoration-accent transition-all cursor-pointer"
                                                >
                                                    {item.company}
                                                </a>
                                            );
                                        })()}
                                    </div>
                                    {item.description && (
                                        <p className="opacity-50 mt-1 leading-relaxed text-[13px] max-w-xl">
                                            {item.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
