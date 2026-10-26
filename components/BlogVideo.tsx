"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";

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

/**
 * Drop-in replacement for the raw <video> tags in posts: same autoplay/loop
 * behaviour, but with a control bar that matches the site instead of the
 * browser's native chrome. Controls stay visible on touch/small screens and
 * fade in on hover on desktop.
 */
export default function BlogVideo({ src, poster }: BlogVideoProps) {
    const ref = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(true);
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

    const toggle = useCallback(() => {
        const v = ref.current;
        if (!v) return;
        if (v.paused) void v.play();
        else v.pause();
    }, []);

    const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = ref.current;
        if (!v) return;
        v.currentTime = Number(e.target.value);
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
        <figure className="group relative my-10 overflow-hidden rounded-2xl border border-foreground/10 bg-black/5">
            <video
                ref={ref}
                src={src}
                poster={poster}
                autoPlay
                loop
                muted
                playsInline
                onClick={toggle}
                className="block h-auto w-full cursor-pointer"
            />

            {!playing && (
                <button
                    type="button"
                    onClick={toggle}
                    aria-label="play"
                    className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
                >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                        <Play size={26} className="ml-1" />
                    </span>
                </button>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-3 pt-8 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <button
                    type="button"
                    onClick={toggle}
                    aria-label={playing ? "pause" : "play"}
                    className="text-white/85 transition-colors hover:text-white"
                >
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>

                <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.01}
                    value={time}
                    onChange={seek}
                    aria-label="seek"
                    className="flex-1 cursor-pointer"
                    style={{ accentColor: "var(--accent, #f59e0b)" }}
                />

                <span className="shrink-0 text-xs tabular-nums text-white/75">
                    {fmt(time)} / {fmt(duration)}
                </span>

                <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? "unmute" : "mute"}
                    className="text-white/85 transition-colors hover:text-white"
                >
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>

                <button
                    type="button"
                    onClick={fullscreen}
                    aria-label="fullscreen"
                    className="text-white/85 transition-colors hover:text-white"
                >
                    <Maximize size={18} />
                </button>
            </div>
        </figure>
    );
}
