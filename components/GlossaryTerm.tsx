"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const GAP = 8;
const EDGE = 8;

/**
 * A jargon term with a one-line definition (see lib/rehypeGlossary.ts).
 * Hover or focus shows it on desktop, tap toggles it on touch. The tooltip is
 * position: fixed and clamped to the viewport, so it never widens the page.
 */
export default function GlossaryTerm({ def, children }: { def: string; children?: React.ReactNode }) {
    const id = useId();
    const termRef = useRef<HTMLSpanElement>(null);
    const tipRef = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    // a tap also fires focus and click; only the click should toggle on touch
    const pointer = useRef<string>("mouse");
    const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

    const place = useCallback(() => {
        const term = termRef.current;
        const tip = tipRef.current;
        if (!term || !tip) return;
        const r = term.getBoundingClientRect();
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, EDGE), window.innerWidth - w - EDGE);
        // above the term, unless that would run off the top of the screen
        const below = r.top - h - GAP < EDGE;
        setPos({ left, top: below ? r.bottom + GAP : r.top - h - GAP, below });
    }, []);

    useLayoutEffect(() => {
        if (open) place();
        else setPos(null);
    }, [open, place]);

    // a fixed tooltip would drift away from its term, so scrolling closes it
    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        window.addEventListener("scroll", close, { passive: true });
        window.addEventListener("resize", close);
        return () => {
            window.removeEventListener("scroll", close);
            window.removeEventListener("resize", close);
        };
    }, [open]);

    return (
        <span
            ref={termRef}
            tabIndex={0}
            aria-describedby={open ? id : undefined}
            className="cursor-help underline decoration-foreground/40 decoration-dotted underline-offset-4 outline-none transition-colors hover:decoration-accent focus-visible:decoration-accent"
            onPointerDown={(e) => (pointer.current = e.pointerType)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
            onFocus={() => pointer.current === "mouse" && setOpen(true)}
            onBlur={() => {
                setOpen(false);
                pointer.current = "mouse";
            }}
            onClick={() => pointer.current !== "mouse" && setOpen((o) => !o)}
        >
            {children}
            {open && (
                <span
                    ref={tipRef}
                    id={id}
                    role="tooltip"
                    style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
                    className="pointer-events-none fixed z-50 block w-max max-w-[17rem] rounded-lg border border-foreground/15 bg-[color-mix(in_oklab,var(--background),var(--foreground)_8%)] px-3 py-2 text-left text-sm font-normal not-italic leading-snug text-foreground/90 shadow-xl"
                >
                    {def}
                </span>
            )}
        </span>
    );
}
