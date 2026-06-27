// The theme system is a continuous ring. Six named anchors sit on it; everything
// in between is interpolated in OKLab so transitions stay clean (no muddy browns).
// A single "phase" in [0,1) drives the whole thing — manual mode snaps to anchors,
// auto mode derives phase from the local clock, play mode sweeps it around the ring.

export type Theme =
    | "sunrise"
    | "sunlight"
    | "sunset"
    | "twilight"
    | "moonlight"
    | "starlight";

export type ThemeMode = "manual" | "auto" | "play";

interface Anchor {
    name: Theme;
    emoji: string;
    dark: boolean;
    // sky gradient, top -> bottom
    stops: [string, string, string];
    // soft glow wash near the top (sun / moon / aurora)
    glow: string;
    foreground: string;
    accent: string;
}

// Cycle order = a day-walk: dawn -> noon -> dusk -> nightfall -> pitch black -> aurora -> back to dawn.
export const ANCHORS: Anchor[] = [
    {
        name: "sunrise",
        emoji: "🌅",
        dark: false,
        stops: ["#f7b9c4", "#fcd2b0", "#fdeede"],
        glow: "#ffd9a8",
        foreground: "#5a3a38",
        accent: "#e8794f",
    },
    {
        name: "sunlight",
        emoji: "☀️",
        dark: false,
        stops: ["#8fcdf2", "#bfe4f7", "#f6fcff"],
        glow: "#fff4d6",
        foreground: "#1b2a3d",
        accent: "#f3a417",
    },
    {
        name: "sunset",
        emoji: "🌇",
        dark: false,
        stops: ["#ff8a6b", "#ffb778", "#ffe2c2"],
        glow: "#ffd28a",
        foreground: "#43221a",
        accent: "#e0531f",
    },
    {
        name: "twilight",
        emoji: "🌆",
        dark: true,
        stops: ["#241a44", "#5b2f7a", "#c65a4e"],
        glow: "#7a4fae",
        foreground: "#f1e3d4",
        accent: "#f0894e",
    },
    {
        name: "moonlight",
        emoji: "🌙",
        dark: true,
        stops: ["#05060c", "#080a12", "#0e1018"],
        glow: "#33405e",
        foreground: "#cdd6e8",
        accent: "#8fb6dd",
    },
    {
        name: "starlight",
        emoji: "🌌",
        dark: true,
        stops: ["#050917", "#114e86", "#16275e"],
        glow: "#4ad0ee",
        foreground: "#dfeefb",
        accent: "#54c5f2",
    },
];

// ---- color math (OKLab) -------------------------------------------------

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB): string {
    const c = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v)))
            .toString(16)
            .padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const fromLinear = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return v * 255;
};

function rgbToOklab([r, g, b]: RGB): RGB {
    const lr = toLinear(r),
        lg = toLinear(g),
        lb = toLinear(b);
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l_ = Math.cbrt(l),
        m_ = Math.cbrt(m),
        s_ = Math.cbrt(s);
    return [
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ];
}

function oklabToRgb([L, a, b]: RGB): RGB {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_,
        m = m_ * m_ * m_,
        s = s_ * s_ * s_;
    return [
        fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
}

function mixHex(a: string, b: string, t: number): string {
    const la = rgbToOklab(hexToRgb(a));
    const lb = rgbToOklab(hexToRgb(b));
    return rgbToHex(
        oklabToRgb([
            la[0] + (lb[0] - la[0]) * t,
            la[1] + (lb[1] - la[1]) * t,
            la[2] + (lb[2] - la[2]) * t,
        ])
    );
}

function hexToRgba(hex: string, alpha: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---- phase -> rendered colors ------------------------------------------

export interface RenderedTheme {
    gradient: string;
    solid: string; // a representative flat color (for bg-background / selection)
    foreground: string;
    accent: string;
    dark: boolean;
    nearest: number; // index of nearest anchor
    aurora: number; // 0..1 strength of the aurora shimmer overlay
}

const wrap = (p: number) => ((p % 1) + 1) % 1;
const ringDist = (a: number, b: number) => {
    const d = Math.abs(wrap(a) - wrap(b));
    return Math.min(d, 1 - d);
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Minimum OKLab-lightness gap to keep between text and its background. At the
// anchors the natural gap is far larger, so this only bites mid-transition,
// where it shoves the foreground to the readable side instead of letting it
// drift through mid-grey at the same moment the background does.
const MIN_L_GAP = 0.4;

export function nearestIndex(phase: number): number {
    return Math.round(wrap(phase) * ANCHORS.length) % ANCHORS.length;
}

const STARLIGHT_PHASE = 5 / 6;

export function phaseToColors(phase: number): RenderedTheme {
    const n = ANCHORS.length;
    const scaled = wrap(phase) * n;
    const i = Math.floor(scaled) % n;
    const j = (i + 1) % n;
    const t = scaled - Math.floor(scaled);
    const a = ANCHORS[i];
    const b = ANCHORS[j];

    const s0 = mixHex(a.stops[0], b.stops[0], t);
    const s1 = mixHex(a.stops[1], b.stops[1], t);
    const s2 = mixHex(a.stops[2], b.stops[2], t);
    const glow = mixHex(a.glow, b.glow, t);
    const accent = mixHex(a.accent, b.accent, t);

    // foreground, with a guaranteed contrast gap against the (mid) background
    const bgL = rgbToOklab(hexToRgb(s1))[0];
    const fgLab = rgbToOklab(hexToRgb(mixHex(a.foreground, b.foreground, t)));
    if (Math.abs(fgLab[0] - bgL) < MIN_L_GAP) {
        fgLab[0] = clamp01(bgL > 0.5 ? bgL - MIN_L_GAP : bgL + MIN_L_GAP);
    }
    const foreground = rgbToHex(oklabToRgb(fgLab));

    const gradient =
        `radial-gradient(125% 85% at 50% 6%, ${hexToRgba(glow, 0.55)} 0%, transparent 60%), ` +
        `linear-gradient(168deg, ${s0} 0%, ${s1} 52%, ${s2} 100%)`;

    // aurora: peaks at starlight, fades across the rest of the night, and is
    // gated by how dark the sky actually is (so it never bleeds into dawn).
    const proximity = clamp01(1 - ringDist(wrap(phase), STARLIGHT_PHASE) / 0.34);
    const darkness = clamp01((0.55 - bgL) / 0.45);
    const aurora = clamp01(proximity * darkness) * 0.9;

    return {
        gradient,
        solid: s1,
        foreground,
        accent,
        dark: t < 0.5 ? a.dark : b.dark,
        nearest: nearestIndex(phase),
        aurora,
    };
}

// ---- local time -> phase -----------------------------------------------

// Anchor wall-clock times, in hours, kept monotonic across midnight:
//   sunrise 06:00, sunlight 12:00, sunset 18:00, twilight 20:00,
//   moonlight 24:00 (midnight), starlight 27:00 (03:00), wrap at 30:00 (06:00).
const ANCHOR_HOURS = [6, 12, 18, 20, 24, 27, 30];
const ANCHOR_PHASES = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1];

export function timeToPhase(date: Date): number {
    const h = date.getHours() + date.getMinutes() / 60;
    const hc = h < 6 ? h + 24 : h; // map into [6, 30)
    for (let k = 0; k < ANCHOR_HOURS.length - 1; k++) {
        if (hc >= ANCHOR_HOURS[k] && hc <= ANCHOR_HOURS[k + 1]) {
            const span = ANCHOR_HOURS[k + 1] - ANCHOR_HOURS[k];
            const t = (hc - ANCHOR_HOURS[k]) / span;
            return wrap(ANCHOR_PHASES[k] + (ANCHOR_PHASES[k + 1] - ANCHOR_PHASES[k]) * t);
        }
    }
    return 0;
}

const CLOCKS = ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"];
export function clockEmoji(date: Date): string {
    return CLOCKS[date.getHours() % 12];
}
