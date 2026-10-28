"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 10;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

interface SvgWindowProps {
    /** Static SVG of one frame of the GPU hierarchy board. */
    src: string;
    /** Original WebP; shown until the SVG arrives (and if it never does). */
    poster: string;
    caption?: string;
    /** Aspect ratio of the original visual, e.g. "1513 / 696". */
    aspect: string;
}

/**
 * A lightweight whiteboard window: one inlined SVG on a pan/zoom surface.
 * No editor, no toolbar, no Excalidraw runtime — just the drawing, scroll to
 * zoom, drag to pan, and four small controls.
 */
export default function SvgWindow({ src, poster, caption, aspect }: SvgWindowProps) {
    const shellRef = useRef<HTMLElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{
        id: number;
        startX: number;
        startY: number;
        viewX: number;
        viewY: number;
        moved: boolean;
    } | null>(null);

    // Only fetch the drawing when it gets near the viewport. The GPU frame is
    // ~900 KB of SVG; the other two are much smaller.
    useEffect(() => {
        const el = shellRef.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setVisible(true);
                    io.disconnect();
                }
            },
            { rootMargin: "800px 0px" }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        if (!visible) return;
        let alive = true;
        fetch(src)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then((text) => {
                if (alive) setSvg(text);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [visible, src]);

    const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const px = clientX === undefined ? 0 : clientX - (rect.left + rect.width / 2);
        const py = clientY === undefined ? 0 : clientY - (rect.top + rect.height / 2);
        setView((v) => {
            const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
            if (scale === v.scale) return v;
            const k = scale / v.scale;
            return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
        });
    }, []);

    const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

    const fullscreen = () => {
        if (document.fullscreenElement === shellRef.current) void document.exitFullscreen();
        else void shellRef.current?.requestFullscreen();
    };

    // Plain wheel zooms toward the cursor. This canvas is its own little
    // viewport, so taking the scroll here is intentional.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
        };
        stage.addEventListener("wheel", onWheel, { passive: false });
        return () => stage.removeEventListener("wheel", onWheel);
    }, [zoomBy]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button")) return;
        dragRef.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            viewX: view.x,
            viewY: view.y,
            moved: false,
        };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4 && !d.moved) {
            d.moved = true;
            setDragging(true);
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.setPointerCapture(e.pointerId);
            }
        }
        if (d.moved) setView((v) => ({ ...v, x: d.viewX + dx, y: d.viewY + dy }));
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        dragRef.current = null;
        setDragging(false);
    };

    return (
        <figure ref={shellRef} className="svg-window my-10">
            <div className="svg-window-card relative overflow-hidden rounded-2xl border border-foreground/10 bg-white shadow-lg">
                <div
                    ref={stageRef}
                    style={{ aspectRatio: aspect }}
                    className="relative w-full cursor-grab touch-none select-none active:cursor-grabbing"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onDoubleClick={() => reset()}
                >
                    {!svg && (
                        <img
                            src={poster}
                            alt={caption || ""}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full select-none object-contain"
                        />
                    )}
                    {svg && (
                        <div
                            className={`svg-window-canvas absolute inset-0 ${dragging ? "is-dragging" : ""}`}
                            style={{
                                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                                transformOrigin: "50% 50%",
                            }}
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                {caption && (
                    <figcaption className="min-w-0 flex-1 text-center text-[0.95rem] italic leading-relaxed opacity-55 break-words">
                        {caption}
                    </figcaption>
                )}
                <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm ring-1 ring-black/5">
                    <button
                        type="button"
                        aria-label="zoom out"
                        title="zoom out"
                        onClick={() => zoomBy(1 / 1.35)}
                        className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        <Minus size={15} />
                    </button>
                    <button
                        type="button"
                        aria-label="zoom in"
                        title="zoom in"
                        onClick={() => zoomBy(1.35)}
                        className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        <Plus size={15} />
                    </button>
                    <button
                        type="button"
                        aria-label="reset view"
                        title="reset view"
                        onClick={reset}
                        className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        <RotateCcw size={14} />
                    </button>
                    <button
                        type="button"
                        aria-label="fullscreen"
                        title="fullscreen"
                        onClick={fullscreen}
                        className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        <Maximize2 size={14} />
                    </button>
                </div>
            </div>
        </figure>
    );
}
