// Animated northern-lights shimmer. Its opacity is driven by --aurora-opacity
// (set per-frame in ThemeProvider) so it glows at starlight and fades elsewhere.
export default function AuroraLayer() {
    return (
        <div
            className="aurora-layer fixed inset-0 pointer-events-none -z-10 overflow-hidden"
            aria-hidden="true"
        >
            <div className="aurora-band aurora-band-1" />
            <div className="aurora-band aurora-band-2" />
            <div className="aurora-band aurora-band-3" />
        </div>
    );
}
