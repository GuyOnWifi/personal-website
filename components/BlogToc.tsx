"use client";

import React, { useEffect, useState } from "react";

export interface TocItem {
    id: string;
    text: string;
    depth: 2 | 3;
}

/**
 * Tick-mark table of contents pinned in the left gutter (the right gutter
 * holds the sidenotes). One tick per h2/h3; the current section's tick is
 * long and bright with its label showing, and hovering the rail fades in
 * every label. Only rendered once the gutter exists (xl+).
 */
export default function BlogToc({ items }: { items: TocItem[] }) {
    const [active, setActive] = useState<string | null>(null);

    useEffect(() => {
        const els = items
            .map((it) => document.getElementById(it.id))
            .filter((el): el is HTMLElement => !!el);
        if (!els.length) return;
        let frame = 0;
        // Current section = last heading whose top has passed 30% of the viewport.
        const update = () => {
            frame = 0;
            const line = window.innerHeight * 0.3;
            let current: string | null = null;
            for (const el of els) {
                if (el.getBoundingClientRect().top <= line) current = el.id;
                else break;
            }
            setActive(current);
        };
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [items]);

    if (items.length < 3) return null;

    return (
        <nav
            aria-label="table of contents"
            className="group/toc fixed left-6 top-1/2 z-20 hidden -translate-y-1/2 xl:block"
        >
            <ul className="m-0 flex list-none flex-col p-0">
                {items.map((it) => {
                    const on = it.id === active;
                    return (
                        <li key={it.id} className="m-0 p-0">
                            <a
                                href={`#${it.id}`}
                                aria-current={on ? "location" : undefined}
                                className="group/item flex h-3.5 cursor-pointer items-center gap-3 no-underline"
                            >
                                {/* fixed-width slot so labels stay aligned as ticks grow */}
                                <span className="flex w-6 shrink-0">
                                    <span
                                        className={`block h-px transition-[width,background-color] duration-200 ${
                                            on
                                                ? "w-6 bg-foreground/70"
                                                : `${it.depth === 2 ? "w-4" : "w-2.5"} bg-foreground/15 group-hover/toc:bg-foreground/25 group-hover/item:w-6 group-hover/item:bg-foreground/60`
                                        }`}
                                    />
                                </span>
                                <span
                                    className={`max-w-[11rem] truncate whitespace-nowrap text-xs transition-[opacity,color] duration-200 ${
                                        it.depth === 3 ? "pl-2" : ""
                                    } ${
                                        on
                                            ? "text-foreground/60 opacity-100"
                                            : "text-foreground/35 opacity-0 group-hover/toc:opacity-100 group-hover/item:text-foreground/75"
                                    }`}
                                >
                                    {it.text}
                                </span>
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
