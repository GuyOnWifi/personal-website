"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SWIPE_PX = 50;

/**
 * Looping carousel of benchmark charts, emitted from Markdown as raw HTML:
 *   <div data-chart-gallery>
 *   <img src="..." alt="..." data-no-caption>
 *   </div>
 * Each <img> is already mapped to a BlogImage (click-to-expand lightbox).
 *
 * The track is [last, ...slides, first]: stepping past either end animates
 * onto the copy, then snaps (without animation) to the real slide, so it
 * wraps around instead of rewinding. Only `transform` animates, so it stays
 * on the compositor on slow devices.
 */
export default function ChartGallery({ children }: { children?: React.ReactNode }) {
    const slides = React.Children.toArray(children).filter(
        (c) => !(typeof c === "string" && c.trim() === "")
    );
    const n = slides.length;
    const track = n > 1 ? [slides[n - 1], ...slides, slides[0]] : slides;

    const [pos, setPos] = useState(n > 1 ? 1 : 0);
    const [animate, setAnimate] = useState(true);
    const [drag, setDrag] = useState(0);
    const busy = useRef(false);
    const dragStart = useRef<{ x: number; y: number; id: number } | null>(null);
    const dragged = useRef(false);

    const index = n > 1 ? (((pos - 1) % n) + n) % n : 0;

    const go = useCallback(
        (delta: number) => {
            if (n < 2) return;
            // Clicks mid-animation keep going, but never past the copies at either end.
            setPos((p) => {
                const next = p + delta;
                if (next < 0 || next > n + 1) return p;
                busy.current = true;
                setAnimate(true);
                return next;
            });
        },
        [n]
    );

    const goTo = (i: number) => {
        if (i === index || busy.current) return;
        busy.current = true;
        setAnimate(true);
        setPos(i + 1);
    };

    // After landing on a copy, jump to the real slide with transitions off,
    // then turn them back on a frame later.
    const settle = useCallback(() => {
        setPos((p) => {
            if (p !== 0 && p !== n + 1) return p;
            setAnimate(false);
            return p === 0 ? n : 1;
        });
        busy.current = false;
    }, [n]);
    const onTransitionEnd = (e: React.TransitionEvent) => {
        if (e.target === e.currentTarget) settle();
    };
    // Fallback in case transitionend never fires (reduced motion, throttled tabs).
    useEffect(() => {
        if (!busy.current) return;
        const t = setTimeout(settle, 500);
        return () => clearTimeout(t);
    }, [pos, settle]);
    useEffect(() => {
        if (animate) return;
        const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
        return () => cancelAnimationFrame(id);
    }, [animate]);

    const onPointerDown = (e: React.PointerEvent) => {
        if (n < 2) return;
        dragStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        dragged.current = false;
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const s = dragStart.current;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        if (!dragged.current) {
            // Let vertical scrolling win; only start a drag on a clearly sideways move.
            if (Math.abs(e.clientY - s.y) > Math.abs(dx) || Math.abs(dx) < 8) return;
            dragged.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setAnimate(false);
        }
        setDrag(dx);
    };
    const endDrag = () => {
        if (!dragStart.current) return;
        dragStart.current = null;
        if (!dragged.current) return;
        const dx = drag;
        setDrag(0);
        setAnimate(true);
        if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1);
    };

    const arrow =
        "absolute top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white shadow-md transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";

    return (
        <div
            className="blog-wide not-prose my-10"
            role="region"
            aria-roledescription="carousel"
            aria-label="benchmark charts"
            onKeyDown={(e) => {
                if (e.key === "ArrowLeft") go(-1);
                if (e.key === "ArrowRight") go(1);
            }}
        >
            <div className="relative">
                <div className="overflow-hidden rounded-2xl">
                    <div
                        className="flex touch-pan-y select-none"
                        style={{
                            transform: `translate3d(calc(${-pos * 100}% + ${drag}px), 0, 0)`,
                            transition: animate && drag === 0 ? "transform 380ms cubic-bezier(0.22, 0.61, 0.36, 1)" : "none",
                        }}
                        onTransitionEnd={onTransitionEnd}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        // A swipe shouldn't also open the lightbox.
                        onClickCapture={(e) => {
                            if (dragged.current) {
                                e.stopPropagation();
                                e.preventDefault();
                                dragged.current = false;
                            }
                        }}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        {track.map((slide, i) => {
                            const copy = n > 1 && (i === 0 || i === n + 1);
                            return (
                                <div
                                    key={i}
                                    className="w-full shrink-0 [&>span]:!my-0"
                                    aria-hidden={copy || undefined}
                                    inert={copy || undefined}
                                    aria-roledescription={copy ? undefined : "slide"}
                                    aria-label={copy ? undefined : `${i} of ${n}`}
                                >
                                    {slide}
                                </div>
                            );
                        })}
                    </div>
                </div>
                {n > 1 && (
                    <>
                        <button type="button" aria-label="previous chart" onClick={() => go(-1)} className={`${arrow} left-3`}>
                            <ChevronLeft size={18} />
                        </button>
                        <button type="button" aria-label="next chart" onClick={() => go(1)} className={`${arrow} right-3`}>
                            <ChevronRight size={18} />
                        </button>
                    </>
                )}
            </div>
            {n > 1 && (
                <div className="mt-4 flex justify-center gap-2">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            aria-label={`go to chart ${i + 1}`}
                            aria-current={i === index}
                            onClick={() => goTo(i)}
                            className={`h-2 cursor-pointer rounded-full transition-[width,background-color] ${i === index ? "w-6 bg-accent" : "w-2 bg-foreground/25 hover:bg-foreground/45"}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
