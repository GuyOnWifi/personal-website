// Silently resolve the visitor's approximate location for the solar day cycle.
// No permission prompt: we try our own /api/location first (which reads Vercel's
// IP-geo headers), then fall back to the free ipwho.is lookup. The result is
// cached in localStorage so we don't repeat the work on every visit.
//
// This is only ever used to pick sunrise/sunset times; nothing is sent anywhere
// beyond the lookup itself, and a failure just means the fixed schedule is used.

import type { Coords } from "./solar";

const CACHE_KEY = "geo";
const TTL = 7 * 24 * 3600 * 1000; // IP-derived location is stable for a while

interface CachedCoords extends Coords {
    ts: number;
}

export function cachedCoords(): Coords | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const c = JSON.parse(raw) as CachedCoords;
        if (
            typeof c.lat === "number" &&
            typeof c.lon === "number" &&
            Number.isFinite(c.lat) &&
            Number.isFinite(c.lon) &&
            Date.now() - c.ts < TTL
        ) {
            return { lat: c.lat, lon: c.lon };
        }
    } catch {
        // ignore malformed / unavailable storage
    }
    return null;
}

function save(coords: Coords) {
    try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...coords, ts: Date.now() }));
    } catch {
        // storage may be blocked; the in-memory value still works this session
    }
}

async function fromOwnApi(): Promise<Coords | null> {
    try {
        const res = await fetch("/api/location");
        if (!res.ok) return null;
        const j = (await res.json()) as { lat?: unknown; lon?: unknown };
        if (typeof j.lat === "number" && typeof j.lon === "number") {
            return { lat: j.lat, lon: j.lon };
        }
    } catch {
        // route may not exist off-Vercel; fall through to the public lookup
    }
    return null;
}

async function fromIpWhoIs(): Promise<Coords | null> {
    try {
        const res = await fetch("https://ipwho.is/");
        if (!res.ok) return null;
        const j = (await res.json()) as {
            success?: boolean;
            latitude?: unknown;
            longitude?: unknown;
        };
        if (
            j.success !== false &&
            typeof j.latitude === "number" &&
            typeof j.longitude === "number"
        ) {
            return { lat: j.latitude, lon: j.longitude };
        }
    } catch {
        // offline or blocked; caller falls back to the fixed schedule
    }
    return null;
}

export async function resolveCoords(): Promise<Coords | null> {
    const cached = cachedCoords();
    if (cached) return cached;

    const coords = (await fromOwnApi()) ?? (await fromIpWhoIs());
    if (coords) save(coords);
    return coords;
}
