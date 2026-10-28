// Location-aware solar geometry for the day cycle.
//
// The theme ring is driven by a single `phase` in [0,1). Historically that phase
// came from a fixed clock (sunrise at 06:00, sunset at 18:00), which drifted out
// of sync with the sky. Here we compute the *real* local solar events from
// latitude/longitude and an instant, then warp them onto the four-anchor ring:
//
//   sunrise -> 0      sunset        -> 0       (day stays flat white)
//   civil dusk -> 1/4  midnight     -> 2/4
//   civil dawn -> 3/4  next sunrise -> 1
//
// Sunlight is a plain light theme, so daylight no longer moves between separate
// dawn/noon/dusk palettes; the colour lives in twilight and the night anchors.
//
// NOAA-style approximations: good to roughly a minute at mid latitudes, which is
// far more than a background gradient needs. All timestamps are epoch ms, so
// the visitor's timezone is irrelevant -- only lat/lon + the instant matter.

const RAD = Math.PI / 180;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface Coords {
    lat: number;
    lon: number;
}

interface SolarTerms {
    decl: number; // solar declination, radians
    eot: number; // equation of time, minutes
}

interface SunTimes {
    noon: number;
    sunrise: number | null;
    sunset: number | null;
    civilDawn: number | null;
    civilDusk: number | null;
}

interface Point {
    t: number;
    p: number;
}

function dayOfYearUTC(date: Date): number {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    return Math.floor((date.getTime() - start) / DAY);
}

function solarTerms(date: Date): SolarTerms {
    const doy = dayOfYearUTC(date);
    const g = (2 * Math.PI * (doy - 1 + (date.getUTCHours() - 12) / 24)) / 365;
    const decl =
        0.006918 -
        0.399912 * Math.cos(g) +
        0.070257 * Math.sin(g) -
        0.006758 * Math.cos(2 * g) +
        0.000907 * Math.sin(2 * g) -
        0.002697 * Math.cos(3 * g) +
        0.00148 * Math.sin(3 * g);
    const eot =
        229.18 *
        (0.000075 +
            0.001868 * Math.cos(g) -
            0.032077 * Math.sin(g) -
            0.014615 * Math.cos(2 * g) -
            0.040849 * Math.sin(2 * g));
    return { decl, eot };
}

/** UTC epoch ms of solar noon for the UTC day containing `date`. */
function solarNoonMs(date: Date, lon: number): number {
    const { eot } = solarTerms(date);
    const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return utcMidnight + (720 - 4 * lon - eot) * MIN;
}

/**
 * Sun altitude in degrees for an instant. Used to resolve polar day/night,
 * where there is no horizon crossing to anchor to.
 */
export function sunAltitude(instant: number, lat: number, lon: number): number {
    const { decl, eot } = solarTerms(new Date(instant));
    const d = new Date(instant);
    const utcMinutes =
        d.getUTCHours() * 60 +
        d.getUTCMinutes() +
        d.getUTCSeconds() / 60 +
        d.getUTCMilliseconds() / 60000;
    const solarMinutes = utcMinutes + eot + 4 * lon;
    const hourAngle = ((solarMinutes - 720) / 4) * RAD;
    const latR = lat * RAD;
    const sinAlt =
        Math.sin(latR) * Math.sin(decl) +
        Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle);
    return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/**
 * Hour angle (radians) at which the sun reaches `zenithDeg`. Returns null when
 * the sun never gets there (polar night) and NaN when it never leaves (polar day).
 */
function hourAngle(lat: number, decl: number, zenithDeg: number): number | null {
    const cosH =
        (Math.cos(zenithDeg * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) /
        (Math.cos(lat * RAD) * Math.cos(decl));
    if (cosH > 1) return null;
    if (cosH < -1) return NaN;
    return Math.acos(cosH);
}

/** Sunrise/sunset/civil twilight times (epoch ms) around a given solar noon. */
function sunTimesForNoon(noon: number, lat: number): SunTimes {
    const { decl } = solarTerms(new Date(noon));
    const toMs = (h: number | null) =>
        h == null || Number.isNaN(h) ? null : (h / RAD) * 4 * MIN;
    const rise = toMs(hourAngle(lat, decl, 90.833)); // refraction + solar radius
    const civil = toMs(hourAngle(lat, decl, 96)); // sun 6 degrees below horizon
    return {
        noon,
        sunrise: rise == null ? null : noon - rise,
        sunset: rise == null ? null : noon + rise,
        civilDawn: civil == null ? null : noon - civil,
        civilDusk: civil == null ? null : noon + civil,
    };
}

/**
 * Control points for the cycle whose sunrise is the start of the window. The
 * window runs sunrise -> next sunrise and carries the ring's phases. Returns
 * null in polar day/night, where there is no such window.
 */
function cyclePoints(noon: number, lat: number): Point[] | null {
    const here = sunTimesForNoon(noon, lat);
    const next = sunTimesForNoon(noon + DAY, lat);
    if (here.sunrise == null || here.sunset == null || next.sunrise == null) return null;

    const midnight = noon + 12 * HOUR;
    const raw: (Point | null)[] = [
        { t: here.sunrise, p: 0 },
        // Daylight is a single flat phase: white from sunrise to sunset.
        { t: here.sunset, p: 0 },
        here.civilDusk == null ? null : { t: here.civilDusk, p: 1 / 4 },
        { t: midnight, p: 2 / 4 },
        next.civilDawn == null ? null : { t: next.civilDawn, p: 3 / 4 },
        { t: next.sunrise, p: 1 },
    ];

    // Civil twilight can vanish in high-latitude summer; drop it and keep the
    // rest. Also drop anything that drifted out of order.
    const out: Point[] = [];
    for (const p of raw) {
        if (p === null) continue;
        if (out.length === 0 || p.t > out[out.length - 1].t) out.push(p);
    }
    return out.length >= 2 ? out : null;
}

function interpolate(pts: Point[], t: number): number {
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (t >= a.t && t <= b.t) {
            const k = (t - a.t) / (b.t - a.t);
            return a.p + (b.p - a.p) * k;
        }
    }
    return pts[pts.length - 1].p;
}

/** Map an instant onto the solar-warped ring phase, or null in polar conditions. */
export function solarPhase(instant: number, { lat, lon }: Coords): number | null {
    const base = solarNoonMs(new Date(instant), lon);
    // Neighbouring cycles tile the timeline, so exactly one contains `instant`.
    for (const noon of [base - DAY, base, base + DAY]) {
        const pts = cyclePoints(noon, lat);
        if (!pts) continue;
        if (instant >= pts[0].t && instant < pts[pts.length - 1].t) {
            return interpolate(pts, instant);
        }
    }
    // Polar day/night: hold the sun (or moon) where it actually is.
    return sunAltitude(instant, lat, lon) > 0 ? 0 : 2 / 4;
}

// ---- fallback: the old fixed schedule ------------------------------------
// Used before a location resolves, or if geolocation is unavailable. Anchor
// wall-clock hours kept monotonic across midnight:
//   sunrise 06, sunset 18, twilight 20, moonlight 24, starlight 27,
//   wrap at 30 (= 06:00 again). Daylight (06–18) stays at phase 0.
const ANCHOR_HOURS = [6, 18, 20, 24, 27, 30];
const ANCHOR_PHASES = [0, 0, 1 / 4, 2 / 4, 3 / 4, 1];
const wrap = (p: number) => ((p % 1) + 1) % 1;

export function legacyTimeToPhase(date: Date): number {
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

/** Real solar phase when we have a location, otherwise the fixed schedule. */
export function phaseForTime(date: Date, coords: Coords | null): number {
    if (coords) {
        const p = solarPhase(date.getTime(), coords);
        if (p != null) return p;
    }
    return legacyTimeToPhase(date);
}
