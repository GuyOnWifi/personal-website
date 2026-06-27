"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";
import { ANCHORS, clockEmoji, nearestIndex } from "./themeCycle";
import { motion, AnimatePresence } from "framer-motion";

export default function ThemeToggle() {
    const { theme, mode, phase, toggleTheme, setMode } = useTheme();
    const [isHovered, setIsHovered] = React.useState(false);
    const [now, setNow] = React.useState<Date | null>(null);

    // live clock for auto mode (client-only, avoids hydration mismatch)
    React.useEffect(() => {
        setNow(new Date());
        const id = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(id);
    }, []);

    const anchorEmoji = ANCHORS[nearestIndex(phase)].emoji;
    const mainEmoji = mode === "auto" && now ? clockEmoji(now) : anchorEmoji;

    const label =
        mode === "auto"
            ? `auto · ${theme}`
            : mode === "play"
              ? "playing…"
              : theme;

    return (
        <div
            className="relative flex items-center justify-center"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <motion.button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-foreground/10 transition-colors flex items-center justify-center text-xl"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label={`cycle theme (current: ${theme})`}
            >
                <AnimatePresence mode="wait">
                    <motion.span
                        key={mainEmoji}
                        initial={{ y: 16, opacity: 0, rotate: -30 }}
                        animate={{ y: 0, opacity: 1, rotate: 0 }}
                        exit={{ y: -16, opacity: 0, rotate: 30 }}
                        transition={{ duration: 0.2 }}
                    >
                        {mainEmoji}
                    </motion.span>
                </AnimatePresence>
            </motion.button>

            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        className="absolute top-full mt-2 flex flex-col items-center gap-1.5 z-50"
                    >
                        <span className="px-2.5 py-1 bg-foreground text-background text-xs rounded-md whitespace-nowrap shadow-lg pointer-events-none">
                            {label}
                        </span>
                        <div className="flex items-center gap-1 p-1 bg-foreground/10 backdrop-blur rounded-full">
                            <ModeButton
                                active={mode === "auto"}
                                title="follow the time of day"
                                onClick={() =>
                                    setMode(mode === "auto" ? "manual" : "auto")
                                }
                            >
                                🕐
                            </ModeButton>
                            <ModeButton
                                active={mode === "play"}
                                title="watch the day cycle"
                                onClick={() =>
                                    setMode(mode === "play" ? "manual" : "play")
                                }
                            >
                                {mode === "play" ? "⏸" : "▶"}
                            </ModeButton>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ModeButton({
    active,
    title,
    onClick,
    children,
}: {
    active: boolean;
    title: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <motion.button
            onClick={onClick}
            title={title}
            aria-label={title}
            aria-pressed={active}
            whileTap={{ scale: 0.85 }}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors ${
                active
                    ? "bg-accent text-background"
                    : "hover:bg-foreground/15 text-foreground"
            }`}
        >
            {children}
        </motion.button>
    );
}
