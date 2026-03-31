"use client";

import React from "react";
import { useTheme, Theme } from "./ThemeProvider";
import { motion, AnimatePresence } from "framer-motion";

const themeIcons: Record<Theme, string> = {
    sunlight: "☀️",
    moonlight: "🌙",
    starlight: "✨",
    twilight: "🌆",
    sunrise: "🌅",
    sunset: "🌇",
};

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <div className="relative flex items-center justify-center">
            <motion.button
                onClick={toggleTheme}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="p-2 rounded-full hover:bg-foreground/10 transition-colors flex items-center justify-center text-xl"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label={`switch theme (current: ${theme})`}
            >
                <AnimatePresence mode="wait">
                    <motion.span
                        key={theme}
                        initial={{ y: 20, opacity: 0, rotate: -45 }}
                        animate={{ y: 0, opacity: 1, rotate: 0 }}
                        exit={{ y: -20, opacity: 0, rotate: 45 }}
                        transition={{ duration: 0.2 }}
                    >
                        {themeIcons[theme]}
                    </motion.span>
                </AnimatePresence>
            </motion.button>

            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        className="absolute top-full mt-2 px-3 py-1 bg-foreground text-background text-xs rounded-md whitespace-nowrap z-50 pointer-events-none shadow-lg"
                    >
                        {theme}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
