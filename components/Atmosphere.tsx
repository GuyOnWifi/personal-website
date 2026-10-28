"use client";

// Background atmosphere layers driven by the theme cycle:
//  - a night starfield that fades in via --star-opacity
//  - a static film grain to kill gradient banding
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface Dot {
    id: number;
    top: number;
    left: number;
    size: number;
    delay: number;
    dur: number;
    base: number;
}

// Fixed (not random) so server and client markup agree. Each streak is visible
// for ~1s of its 9-17s cycle; staggered delays keep them occasional.
const SHOOTING_STARS = [
    { top: "2%", left: "-8%", angle: 14, delay: "1s", dur: "9s", len: 140, dist: 820 },
    { top: "34%", left: "-6%", angle: 24, delay: "4s", dur: "11s", len: 175, dist: 980 },
    { top: "1%", left: "45%", angle: 12, delay: "7s", dur: "13s", len: 115, dist: 760 },
    { top: "52%", left: "18%", angle: 27, delay: "10s", dur: "15s", len: 195, dist: 1150 },
    { top: "22%", left: "80%", angle: 22, delay: "13s", dur: "17s", len: 150, dist: 900 },
];

export default function Atmosphere() {
    const pathname = usePathname();
    // Long-form reading is the last place you want a streak of light crossing
    // the paragraph you're on. Keep the shooting stars for the landing page;
    // the static starfield stays everywhere.
    const showShootingStars = !pathname?.startsWith("/blog");
    const [stars, setStars] = useState<Dot[]>([]);

    useEffect(() => {
        setStars(
            Array.from({ length: 190 }, (_, i) => ({
                id: i,
                top: Math.random() * 100,
                left: Math.random() * 100,
                size: Math.random() * 2 + 0.8,
                delay: Math.random() * 6,
                dur: Math.random() * 3.5 + 2.5,
                base: Math.random() * 0.45 + 0.5,
            }))
        );
    }, []);

    return (
        <>
            <div className="starfield fixed inset-0 -z-10 pointer-events-none overflow-hidden">
                {stars.map((s) => (
                    <span
                        key={s.id}
                        className={`star-dot${s.size > 2.1 && s.base > 0.75 ? " star-bright" : ""}`}
                        style={
                            {
                                top: `${s.top}%`,
                                left: `${s.left}%`,
                                width: `${s.size}px`,
                                height: `${s.size}px`,
                                animationDelay: `${s.delay}s`,
                                animationDuration: `${s.dur}s`,
                                "--star-base": s.base,
                            } as React.CSSProperties
                        }
                    />
                ))}

                {showShootingStars &&
                    SHOOTING_STARS.map((s, i) => (
                        <span
                            key={`shoot-${i}`}
                            className="shooting-star"
                            style={
                                {
                                    top: s.top,
                                    left: s.left,
                                    "--angle": `${s.angle}deg`,
                                    "--dur": s.dur,
                                    "--delay": s.delay,
                                    "--dist": `${s.dist}px`,
                                    "--len": `${s.len}px`,
                                } as React.CSSProperties
                            }
                        >
                            <span className="shooting-star-streak" />
                        </span>
                    ))}
            </div>

            <div className="grain fixed inset-0 -z-10 pointer-events-none" />
        </>
    );
}
