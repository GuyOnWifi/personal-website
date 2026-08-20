"use client";

// Background atmosphere layers driven by the theme cycle:
//  - a night starfield that fades in via --star-opacity
//  - a static film grain to kill gradient banding
import { useEffect, useState } from "react";

interface Dot {
    id: number;
    top: number;
    left: number;
    size: number;
    delay: number;
    dur: number;
    base: number;
}

export default function Atmosphere() {
    const [stars, setStars] = useState<Dot[]>([]);

    useEffect(() => {
        setStars(
            Array.from({ length: 90 }, (_, i) => ({
                id: i,
                top: Math.random() * 100,
                left: Math.random() * 100,
                size: Math.random() * 1.6 + 0.6,
                delay: Math.random() * 6,
                dur: Math.random() * 3 + 2,
                base: Math.random() * 0.5 + 0.35,
            }))
        );
    }, []);

    return (
        <>
            <div className="starfield fixed inset-0 -z-10 pointer-events-none overflow-hidden">
                {stars.map((s) => (
                    <span
                        key={s.id}
                        className="star-dot"
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
            </div>

            <div className="grain fixed inset-0 -z-10 pointer-events-none" />
        </>
    );
}
