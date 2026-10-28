"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

interface BlogImageProps {
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Blog images are dense (cache diagrams, perf plots, topology maps), so the
 * inline size is almost never enough. Click one and it opens a full-screen
 * lightbox with wheel/pinch zoom and drag-to-pan, which keeps the source image
 * at its native resolution instead of baking in a crop.
 */
export default function BlogImage({ src, alt, width, height }: BlogImageProps) {
    const [open, setOpen] = useState(false);

    if (!src) return null;

    return (
        <span className="block my-10">
            <span
                role="button"
                tabIndex={0}
                aria-label={alt ? `expand image: ${alt}` : "expand image"}
                onClick={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                className="group relative block cursor-zoom-in rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
                <img
                    src={src}
                    alt={alt || "Blog image"}
                    width={width}
                    height={height}
                    loading="lazy"
                    decoding="async"
                    className="block h-auto w-full rounded-2xl shadow-lg transition-[filter,transform] duration-300 group-hover:brightness-[0.97]"
                />
                <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-[0.7rem] font-medium text-white opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Maximize2 size={13} />
                    expand
                </span>
            </span>
            {alt && <span className="block text-center text-[0.95rem] opacity-55 mt-4 italic break-words">{alt}</span>}
            {open &&
                createPortal(
                    <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />,
                    document.body
                )}
        </span>
    );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
    const stageRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });

    const movedRef = useRef(false);
    const startedOnImageRef = useRef(false);
    const dragRef = useRef<{
        id: number;
        startX: number;
        startY: number;
        viewX: number;
        viewY: number;
        scale: number;
        moved: boolean;
    } | null>(null);

    // Lock background scrolling while the lightbox is open.
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

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

    // React's wheel listener is passive, so attach a native one to be able to
    // prevent the page from scrolling while zooming the image.
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoomBy(Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
        };
        stage.addEventListener("wheel", onWheel, { passive: false });
        return () => stage.removeEventListener("wheel", onWheel);
    }, [zoomBy]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "+" || e.key === "=") zoomBy(1.3);
            else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.3);
            else if (e.key === "0") setView({ scale: 1, x: 0, y: 0 });
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, zoomBy]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        movedRef.current = false;
        startedOnImageRef.current = (e.target as HTMLElement).closest("img") !== null;
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            viewX: view.x,
            viewY: view.y,
            scale: view.scale,
            moved: false,
        };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
            d.moved = true;
            movedRef.current = true;
        }
        if (d.scale > 1) {
            setView((v) => ({ ...v, x: d.viewX + dx, y: d.viewY + dy }));
        }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        dragRef.current = null;
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
            role="dialog"
            aria-modal="true"
            aria-label={alt ? `expanded image: ${alt}` : "expanded image"}
            onClick={() => {
                // A pan also ends in a click on the backdrop; don't close on it.
                if (movedRef.current) {
                    movedRef.current = false;
                    return;
                }
                // Pointer capture retargets clicks to the stage, so remember
                // where the interaction started: clicking the image keeps the
                // lightbox open, clicking the surround closes it.
                if (startedOnImageRef.current) {
                    startedOnImageRef.current = false;
                    return;
                }
                onClose();
            }}
        >
            <div className="flex items-center justify-end gap-4 px-4 py-3 md:px-6">
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        aria-label="zoom out"
                        onClick={(e) => {
                            e.stopPropagation();
                            zoomBy(1 / 1.3);
                        }}
                        className="grid h-9 w-9 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <Minus size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="zoom in"
                        onClick={(e) => {
                            e.stopPropagation();
                            zoomBy(1.3);
                        }}
                        className="grid h-9 w-9 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <Plus size={18} />
                    </button>
                    <button
                        type="button"
                        aria-label="reset zoom"
                        onClick={(e) => {
                            e.stopPropagation();
                            setView({ scale: 1, x: 0, y: 0 });
                        }}
                        className="grid h-9 w-9 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <RotateCcw size={17} />
                    </button>
                    <button
                        type="button"
                        aria-label="close"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className="ml-1 grid h-9 w-9 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div
                ref={stageRef}
                className="relative flex-1 touch-none select-none overflow-hidden"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (view.scale > 1) setView({ scale: 1, x: 0, y: 0 });
                    else zoomBy(2.5 / view.scale, e.clientX, e.clientY);
                }}
            >
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 md:p-8">
                    <img
                        src={src}
                        alt={alt || "Blog image"}
                        draggable={false}
                        onClick={(e) => e.stopPropagation()}
                        className="pointer-events-auto max-h-full max-w-full select-none object-contain shadow-2xl"
                        style={{
                            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                            cursor: view.scale > 1 ? "grab" : "zoom-in",
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
