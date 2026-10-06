import { headers } from "next/headers";

// Returns the visitor's approximate coordinates from the host's IP-geo headers.
// On Vercel these are populated automatically; anywhere else we return nulls and
// the client falls back to a public IP lookup. Reading request headers makes
// this dynamic, which is exactly what we want -- never cached across visitors.
export const dynamic = "force-dynamic";

export async function GET() {
    const h = await headers();
    const lat = Number.parseFloat(h.get("x-vercel-ip-latitude") ?? "");
    const lon = Number.parseFloat(h.get("x-vercel-ip-longitude") ?? "");

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return Response.json(
            { lat, lon, source: "vercel" },
            { headers: { "Cache-Control": "private, max-age=3600" } },
        );
    }

    return Response.json({ lat: null, lon: null });
}
