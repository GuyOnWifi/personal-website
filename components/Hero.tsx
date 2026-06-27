"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface StarProps {
    id?: number;
    top: string;
    left: string;
    size: string;
    duration: number;
    delay: number;
}

const Star: React.FC<StarProps> = ({ top, left, size, duration, delay }) => (
    <motion.div
        className="absolute rounded-full bg-white"
        style={{ top, left, width: size, height: size }}
        animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.2, 1] }}
        transition={{
            duration,
            delay,
            repeat: Infinity,
            ease: "easeInOut",
        }}
    />
);

interface NodeProps {
    cx: string | number;
    cy: string | number;
    duration?: number;
    delay?: number;
}

const ConstellationNode: React.FC<NodeProps> = ({ cx, cy, duration = 1.5, delay = 0 }) => (
    <motion.circle
        cx={cx}
        cy={cy}
        r="4"
        fill="white"
        animate={{ opacity: [0.5, 1, 0.5], r: [3, 5, 3] }}
        transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
        style={{ filter: "drop-shadow(0px 0px 4px rgba(255, 255, 255, 0.8))" }}
    />
);

const NODE_COORDS: { cx: number; cy: number }[] = [
    { cx: 320, cy: 260 }, { cx: 260, cy: 260 }, { cx: 250, cy: 220 },
    { cx: 300, cy: 190 }, { cx: 330, cy: 220 }, { cx: 280, cy: 230 },
    { cx: 420, cy: 260 }, { cx: 380, cy: 260 }, { cx: 370, cy: 220 },
    { cx: 410, cy: 190 }, { cx: 440, cy: 220 }, { cx: 430, cy: 260 },
    { cx: 450, cy: 260 },
    { cx: 480, cy: 260 }, { cx: 530, cy: 240 }, { cx: 490, cy: 220 },
    { cx: 540, cy: 190 },
    { cx: 610, cy: 190 }, { cx: 580, cy: 220 }, { cx: 600, cy: 260 },
    { cx: 640, cy: 240 },
    { cx: 680, cy: 260 }, { cx: 680, cy: 190 }, { cx: 730, cy: 220 },
    { cx: 730, cy: 260 },
];

// candidate positions for the big lone star, outside the name area
const LONE_STAR_POSITIONS: { cx: number; cy: number }[] = [
    { cx: 120, cy: 100 },
    { cx: 880, cy: 90 },
    { cx: 920, cy: 380 },
    { cx: 90, cy: 380 },
    { cx: 850, cy: 200 },
    { cx: 150, cy: 420 },
];

export default function Hero() {
    const [stars, setStars] = useState<StarProps[]>([]);
    const [twinkles, setTwinkles] = useState<{ duration: number; delay: number }[]>([]);
    const [loneStar, setLoneStar] = useState<{ cx: number; cy: number; duration: number; delay: number } | null>(null);

    useEffect(() => {
        // Generate random background stars
        const generateStars = () => {
            const newStars = [];
            for (let i = 0; i < 150; i++) {
                newStars.push({
                    id: i,
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    size: Math.random() * 2 + 1 + "px",
                    duration: Math.random() * 3 + 2, // 2 to 5 seconds
                    delay: Math.random() * 5,
                });
            }
            setStars(newStars);
        };

        generateStars();

        setTwinkles(
            NODE_COORDS.map(() => ({
                duration: Math.random() * 2.5 + 1.5, // 1.5 to 4s
                delay: Math.random() * 5, // 0 to 5s phase offset
            })),
        );

        const pos = LONE_STAR_POSITIONS[Math.floor(Math.random() * LONE_STAR_POSITIONS.length)];
        setLoneStar({
            ...pos,
            duration: Math.random() * 2 + 2.5, // 2.5 to 4.5s
            delay: Math.random() * 3,
        });
    }, []);

    // ViewBox coordinates for the constellation. (0,0) to (1000, 500)
    // Scaling it roughly to match the screen's aspect ratio and center it.

    // Coordinates based approximately on the image
    // e (lowercase)
    const ePath = "M 320 260 L 260 260 L 250 220 L 300 190 L 330 220 L 280 230";

    // a
    const aPath =
        "M 420 260 L 380 260 L 370 220 L 410 190 L 440 220 L 430 260 M 440 220 L 450 260";

    // s
    const sPath = "M 480 260 L 530 240 L 490 220 L 540 190";

    // o
    const oPath = "M 610 190 L 580 220 L 600 260 L 640 240 Z";

    // n
    const nPath = "M 680 260 L 680 190 L 730 220 L 730 260";

    const drawTransition = { duration: 3, ease: "easeInOut" as const };

    return (
        <div className="relative h-[240px] w-full overflow-hidden rounded-2xl bg-foreground/[0.04] backdrop-blur-sm border border-foreground/10 box-content">
            {/* Background Stars */}
            {stars.map((star) => (
                <Star key={star.id} {...star} />
            ))}

            {/* Constellation SVG Container */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
                <svg
                    className="w-full h-full"
                    viewBox="0 0 1000 500"
                    preserveAspectRatio="xMidYMid meet"
                >
                    <g transform="translate(500, 250) scale(2) translate(-490, -225)">
                        {/* e */}
                        <motion.path
                            d={ePath}
                            stroke="var(--accent)"
                            strokeWidth="2"
                            strokeOpacity="0.4"
                            fill="none"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={drawTransition}
                        />
                        {/* a */}
                        <motion.path
                            d={aPath}
                            stroke="var(--accent)"
                            strokeWidth="2"
                            strokeOpacity="0.4"
                            fill="none"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={drawTransition}
                        />
                        {/* s */}
                        <motion.path
                            d={sPath}
                            stroke="var(--accent)"
                            strokeWidth="2"
                            strokeOpacity="0.4"
                            fill="none"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={drawTransition}
                        />
                        {/* o */}
                        <motion.path
                            d={oPath}
                            stroke="var(--accent)"
                            strokeWidth="2"
                            strokeOpacity="0.4"
                            fill="none"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={drawTransition}
                        />
                        {/* n */}
                        <motion.path
                            d={nPath}
                            stroke="var(--accent)"
                            strokeWidth="2"
                            strokeOpacity="0.4"
                            fill="none"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={drawTransition}
                        />
                        {/* Twinkling nodes (rendered on top of all paths) */}
                        {twinkles.length > 0 &&
                            NODE_COORDS.map((node, i) => (
                                <ConstellationNode
                                    key={`${i}-${twinkles[i].duration}-${twinkles[i].delay}`}
                                    cx={node.cx}
                                    cy={node.cy}
                                    duration={twinkles[i].duration}
                                    delay={twinkles[i].delay}
                                />
                            ))}
                    </g>
                    {/* Lone big star, rendered outside the scaled group at its raw coords */}
                    {loneStar && (
                        <motion.circle
                            key={`lone-${loneStar.cx}-${loneStar.cy}-${loneStar.duration}-${loneStar.delay}`}
                            cx={loneStar.cx}
                            cy={loneStar.cy}
                            r="7"
                            fill="white"
                            animate={{ opacity: [0.4, 1, 0.4], r: [6, 9, 6] }}
                            transition={{
                                duration: loneStar.duration,
                                delay: loneStar.delay,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                            style={{ filter: "drop-shadow(0px 0px 8px rgba(255, 255, 255, 0.9))" }}
                        />
                    )}
                </svg>
            </div>

        </div>
    );
}
