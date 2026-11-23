"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartColumn } from "lucide-react";
import { ImageLightbox } from "@/components/BlogImage";

const PEEK_W = 420;
// Chart renders are 1128x636.
const PEEK_ASPECT = 636 / 1128;

/**
 * Small chart icon for a table header, emitted from Markdown as
 *   TTFT <span data-chart="/path/to/chart.webp" data-alt="Serve: TTFT"></span>
 * Hover/focus previews the chart in a floating card; click opens the lightbox.
 * The card is portalled with fixed positioning so the table's overflow-x
 * wrapper can't clip it.
 */
export default function ChartPeek({ src, alt }: { src: string; alt?: string }) {
    const iconRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
    const [open, setOpen] = useState(false);

    const show = () => {
        const r = iconRef.current?.getBoundingClientRect();
        if (!r) return;
        const w = Math.min(PEEK_W, window.innerWidth - 32);
        const h = w * PEEK_ASPECT;
        const left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 16));
        // Below the icon if it fits, otherwise above; then clamp so it never
        // leaves the viewport on short screens.
        const fitsBelow = r.bottom + 8 + h <= window.innerHeight - 8;
        const top = fitsBelow ? r.bottom + 8 : r.top - 8 - h;
        setPos({ left, top: Math.max(8, Math.min(top, window.innerHeight - h - 8)), width: w });
    };
    const hide = () => setPos(null);

    // Fixed positioning goes stale once the page moves, so just close it.
    useEffect(() => {
        if (!pos) return;
        window.addEventListener("scroll", hide, { passive: true });
        window.addEventListener("resize", hide);
        return () => {
            window.removeEventListener("scroll", hide);
            window.removeEventListener("resize", hide);
        };
    }, [pos]);

    return (
        <>
            <button
                ref={iconRef}
                type="button"
                aria-label={alt ? `show chart: ${alt}` : "show chart"}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onClick={() => {
                    hide();
                    setOpen(true);
                }}
                className="ml-1.5 inline-flex translate-y-[2px] cursor-pointer items-center rounded text-foreground/45 transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
            >
                <ChartColumn size={15} />
            </button>
            {pos &&
                createPortal(
                    <span
                        className="pointer-events-none fixed z-50 block overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10"
                        style={{ left: pos.left, top: pos.top, width: pos.width }}
                    >
                        <img src={src} alt={alt ?? ""} className="block h-auto w-full" />
                    </span>,
                    document.body
                )}
            {open &&
                createPortal(<ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />, document.body)}
        </>
    );
}
