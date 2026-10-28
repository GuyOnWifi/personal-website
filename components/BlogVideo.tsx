"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";

interface BlogVideoProps {
    src?: string;
    poster?: string;
    className?: string;
}

function fmt(t: number) {
    if (!Number.isFinite(t) || t < 0) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

const STEP_SECONDS = 0.5;
const FRAME_SECONDS = 1 / 60;

/**
 * Drop-in replacement for the raw <video> tags in posts: same autoplay/loop
 * behaviour, but with a control bar that matches the excanimate player (white
 * floating pill, round transport buttons, custom seek track).
 *
 * Videos are only attached when they get near the viewport (the CUDA post has
 * three 1080p60 files) and pause when they leave it. There is deliberately no
 * full-frame play overlay: readers pause to step through the animation and the
 * overlay used to cover the exact diagram they were looking at.
 */
export default function BlogVideo({ src, poster }: BlogVideoProps) {
    const ref = useRef<HTMLVideoElement>(null);
    const figureRef = useRef<HTMLElement>(null);
    const userPaused = useRef(false);
    const [srcActive, setSrcActive] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(true);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const v = ref.current;
        if (!v) return;
        const onTime = () => setTime(v.currentTime);
        const onMeta = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        v.addEventListener("timeupdate", onTime);
        v.addEventListener("loadedmetadata", onMeta);
        v.addEventListener("durationchange", onMeta);
        v.addEventListener("play", onPlay);
        v.addEventListener("pause", onPause);
        return () => {
            v.removeEventListener("timeupdate", onTime);
            v.removeEventListener("loadedmetadata", onMeta);
            v.removeEventListener("durationchange", onMeta);
            v.removeEventListener("play", onPlay);
            v.removeEventListener("pause", onPause);
        };
    }, []);

    // Attach the source lazily and only autoplay while the figure is on screen.
    useEffect(() => {
        const figure = figureRef.current;
        if (!figure) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    setSrcActive(true);
                } else {
                    // Pause off-screen without counting it as a user pause, so
                    // scrolling back into the figure resumes playback.
                    ref.current?.pause();
                }
            },
            { rootMargin: "600px 0px" }
        );
        io.observe(figure);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        if (!srcActive) return;
        const v = ref.current;
        if (!v || userPaused.current) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (!entry) return;
                if (entry.isIntersecting && !userPaused.current) void v.play().catch(() => {});
                else v.pause();
            },
            { threshold: 0.2 }
        );
        io.observe(v);
        return () => io.disconnect();
    }, [srcActive]);

    const toggle = useCallback(() => {
        const v = ref.current;
        if (!v) return;
        if (v.paused) {
            userPaused.current = false;
            void v.play();
        } else {
            userPaused.current = true;
            v.pause();
        }
    }, []);

    const pauseForScrub = useCallback(() => {
        const v = ref.current;
        if (!v) return;
        userPaused.current = true;
        v.pause();
    }, []);

    const seekTo = useCallback((next: number) => {
        const v = ref.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, next));
        setTime(v.currentTime);
    }, []);

    const step = useCallback((direction: number, fine: boolean) => {
        const v = ref.current;
        if (!v) return;
        userPaused.current = true;
        v.pause();
        const delta = direction * (fine ? FRAME_SECONDS : STEP_SECONDS);
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
        setTime(v.currentTime);
    }, []);

    const toggleMute = useCallback(() => {
        const v = ref.current;
        if (!v) return;
        v.muted = !v.muted;
        setMuted(v.muted);
    }, []);

    const fullscreen = useCallback(() => {
        const v = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        if (!v) return;
        if (v.requestFullscreen) void v.requestFullscreen();
        else v.webkitEnterFullscreen?.();
    }, []);

    return (
        <figure
            ref={figureRef}
            className="group relative my-10 overflow-hidden rounded-2xl border border-foreground/10 bg-black/5"
        >
            <video
                ref={ref}
                src={srcActive ? src : undefined}
                poster={poster}
                loop
                muted
                playsInline
                preload="none"
                onClick={toggle}
                className="block h-auto w-full cursor-pointer bg-black/5"
            />

            <div
                className={`absolute inset-x-2.5 bottom-2.5 flex items-center gap-1 rounded-[10px] bg-white px-2 py-1.5 text-neutral-700 shadow-[0_4px_18px_rgba(0,0,0,0.22)] ring-1 ring-black/10 transition-opacity ${
                    playing ? "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" : "opacity-100"
                }`}
            >
                <button
                    type="button"
                    onClick={(e) => step(-1, e.shiftKey)}
                    aria-label="back 0.5 seconds"
                    title="back 0.5s (shift-click: one frame)"
                    className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <StepBack size={16} />
                </button>
                <button
                    type="button"
                    onClick={toggle}
                    aria-label={playing ? "pause" : "play"}
                    className="grid h-7 w-7 place-items-center rounded-md text-neutral-800 transition-colors hover:bg-neutral-100"
                >
                    {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
                <button
                    type="button"
                    onClick={(e) => step(1, e.shiftKey)}
                    aria-label="forward 0.5 seconds"
                    title="forward 0.5s (shift-click: one frame)"
                    className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <StepForward size={16} />
                </button>

                <SeekBar
                    time={time}
                    duration={duration}
                    onScrubStart={pauseForScrub}
                    onSeek={seekTo}
                />

                <span className="min-w-[74px] shrink-0 text-right text-[0.72rem] tabular-nums text-neutral-500">
                    {fmt(time)} / {fmt(duration)}
                </span>

                <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? "unmute" : "mute"}
                    className="hidden h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:grid"
                >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>

                <button
                    type="button"
                    onClick={fullscreen}
                    aria-label="fullscreen"
                    className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <Maximize size={16} />
                </button>
            </div>
        </figure>
    );
}

function SeekBar({
    time,
    duration,
    onScrubStart,
    onSeek,
}: {
    time: number;
    duration: number;
    onScrubStart: () => void;
    onSeek: (t: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const pct = duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;

    const seekFromPointer = (clientX: number) => {
        const track = trackRef.current;
        if (!track || !duration) return;
        const rect = track.getBoundingClientRect();
        onSeek(((clientX - rect.left) / rect.width) * duration);
    };

    return (
        <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                onScrubStart();
                seekFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e.clientX);
            }}
            onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }
            }}
            onPointerCancel={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }
            }}
            onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                    e.preventDefault();
                    onScrubStart();
                    onSeek(time + STEP_SECONDS);
                } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    onScrubStart();
                    onSeek(time - STEP_SECONDS);
                } else if (e.key === "Home") {
                    e.preventDefault();
                    onScrubStart();
                    onSeek(0);
                } else if (e.key === "End") {
                    e.preventDefault();
                    onScrubStart();
                    onSeek(duration);
                }
            }}
            className="relative h-7 flex-1 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1"
        >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-neutral-300/70" />
            <div
                className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
                style={{ width: `${pct}%`, backgroundColor: "var(--accent, #6965db)" }}
            />
            <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
                style={{ left: `${pct}%`, backgroundColor: "var(--accent, #6965db)" }}
            />
        </div>
    );
}
