"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
    ANCHORS,
    Theme,
    ThemeMode,
    phaseToColors,
    phaseToOrbs,
    nearestIndex,
} from "./themeCycle";
import { phaseForTime, type Coords } from "./solar";
import { cachedCoords, resolveCoords } from "./location";

export type { Theme, ThemeMode } from "./themeCycle";

interface ThemeContextType {
    theme: Theme; // nearest anchor (for labels / syntax highlighting)
    mode: ThemeMode;
    phase: number;
    toggleTheme: () => void; // manual: advance to next anchor
    setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const wrap = (p: number) => ((p % 1) + 1) % 1;
const easeInOut = (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function applyPhase(phase: number) {
    const c = phaseToColors(phase);
    const root = document.documentElement;
    root.style.setProperty("--bg-gradient", c.gradient);
    root.style.setProperty("--background", c.solid);
    root.style.setProperty("--foreground", c.foreground);
    root.style.setProperty("--accent", c.accent);
    root.style.setProperty("--aurora-opacity", c.aurora.toFixed(3));
    root.style.setProperty("--star-opacity", c.night.toFixed(3));

    const o = phaseToOrbs(phase);
    root.style.setProperty("--sun-x", `${o.sunX.toFixed(2)}%`);
    root.style.setProperty("--sun-y", `${o.sunY.toFixed(2)}%`);
    root.style.setProperty("--sun-opacity", o.sunOpacity.toFixed(3));
    root.style.setProperty("--moon-x", `${o.moonX.toFixed(2)}%`);
    root.style.setProperty("--moon-y", `${o.moonY.toFixed(2)}%`);
    root.style.setProperty("--moon-opacity", o.moonOpacity.toFixed(3));

    root.style.colorScheme = c.dark ? "dark" : "light";
    root.setAttribute("data-theme", ANCHORS[c.nearest].name);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setModeState] = useState<ThemeMode>("manual");
    const [phase, setPhaseState] = useState(2 / 4); // moonlight by default

    const phaseRef = useRef(phase);
    const rafRef = useRef<number | undefined>(undefined);
    const autoRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    // Nearest anchor as of the last React render. Used to skip state updates
    // for frames that don't change which theme we're on.
    const lastThemeRef = useRef(nearestIndex(phase));
    // Visitor location for the solar day cycle; null means "use the fallback
    // fixed schedule". Resolved silently after mount.
    const coordsRef = useRef<Coords | null>(null);
    const modeRef = useRef<ThemeMode>(mode);

    // The phase that matches the real sky right now (or the fixed schedule
    // before a location resolves).
    const nowPhase = () => phaseForTime(new Date(), coordsRef.current);

    const setPhase = (p: number) => {
        const v = wrap(p);
        phaseRef.current = v;
        // Paint the frame straight onto <html>. This is what actually moves the
        // sky/sun/moon. The React state below only feeds the label + code theme.
        applyPhase(v);

        // Only re-render when the nearest anchor changes. Previously every
        // animation frame called setPhaseState, re-rendering every context
        // consumer 60x/sec during play/auto for no visual difference.
        const idx = nearestIndex(v);
        if (idx !== lastThemeRef.current) {
            lastThemeRef.current = idx;
            setPhaseState(v);
        }
    };

    const cancelAnim = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
    };
    const cancelAuto = () => {
        if (autoRef.current) clearInterval(autoRef.current);
        autoRef.current = undefined;
    };

    // Tween phase to a target. `forward` forces motion in the cycle's
    // direction (manual stepping); otherwise take the shortest arc.
    const tweenTo = (target: number, forward = false, dur = 700) => {
        cancelAnim();
        const start = phaseRef.current;
        let delta = wrap(target - start);
        if (!forward && delta > 0.5) delta -= 1; // shortest arc
        const t0 = performance.now();
        const step = (now: number) => {
            const k = Math.min(1, (now - t0) / dur);
            setPhase(start + delta * easeInOut(k));
            if (k < 1) rafRef.current = requestAnimationFrame(step);
            else rafRef.current = undefined;
        };
        rafRef.current = requestAnimationFrame(step);
    };

    const startPlay = () => {
        cancelAnim();
        cancelAuto();
        const t0 = performance.now();
        const base = phaseRef.current;
        const PERIOD = 18000; // ms for a full day
        const step = (now: number) => {
            setPhase(base + (now - t0) / PERIOD);
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    };

    const startAuto = () => {
        cancelAnim();
        cancelAuto();
        tweenTo(nowPhase(), false, 900);
        autoRef.current = setInterval(() => {
            setPhase(nowPhase()); // tiny step every tick — imperceptible
        }, 30000);
    };

    const setMode = (next: ThemeMode) => {
        setModeState(next);
        modeRef.current = next;
        if (next === "play") {
            startPlay();
        } else if (next === "auto") {
            // Make sure we have a location; if the lookup is still pending the
            // sky just follows the fallback schedule until it lands.
            if (!coordsRef.current) {
                resolveCoords().then((c) => {
                    if (!c) return;
                    coordsRef.current = c;
                    if (modeRef.current === "auto") tweenTo(nowPhase(), false, 900);
                });
            }
            startAuto();
            try {
                localStorage.setItem("themeMode", "auto");
            } catch {}
        } else {
            // manual: stop everything, snap to the nearest anchor
            cancelAnim();
            cancelAuto();
            const idx = nearestIndex(phaseRef.current);
            tweenTo(idx / ANCHORS.length, false, 500);
            try {
                localStorage.setItem("themeMode", "manual");
                localStorage.setItem("theme", ANCHORS[idx].name);
            } catch {}
        }
    };

    const toggleTheme = () => {
        cancelAuto();
        if (mode !== "manual") {
            setModeState("manual");
            modeRef.current = "manual";
        }
        const nextIdx = (nearestIndex(phaseRef.current) + 1) % ANCHORS.length;
        tweenTo(nextIdx / ANCHORS.length, true);
        try {
            localStorage.setItem("themeMode", "manual");
            localStorage.setItem("theme", ANCHORS[nextIdx].name);
        } catch {}
    };

    // mount: restore saved mode / theme, then resolve location for the solar sky
    useEffect(() => {
        let initialPhase = 2 / 4;
        let initialMode: ThemeMode = "manual";
        try {
            const savedMode = localStorage.getItem("themeMode");
            const savedTheme = localStorage.getItem("theme") as Theme | null;
            const idx = ANCHORS.findIndex((a) => a.name === savedTheme);
            if (idx >= 0) initialPhase = idx / ANCHORS.length;
            if (savedMode === "auto") initialMode = "auto";
        } catch {}

        // Use a previously cached location immediately, if any.
        coordsRef.current = cachedCoords();

        if (initialMode === "auto") {
            setModeState("auto");
            modeRef.current = "auto";
            setPhase(nowPhase());
            autoRef.current = setInterval(() => {
                setPhase(nowPhase());
            }, 30000);
        } else {
            setPhase(initialPhase);
        }

        // Resolve the location in the background; when it arrives, snap the sky
        // to the real solar position (only if we're still following the clock).
        resolveCoords().then((c) => {
            if (!c) return;
            coordsRef.current = c;
            if (modeRef.current === "auto") tweenTo(phaseForTime(new Date(), c), false, 900);
        });

        return () => {
            cancelAnim();
            cancelAuto();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const theme = ANCHORS[nearestIndex(phase)].name;

    return (
        <ThemeContext.Provider value={{ theme, mode, phase, toggleTheme, setMode }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
};
