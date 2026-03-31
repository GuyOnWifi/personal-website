export default function GridBackground() {
    return (
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
            <div className="absolute inset-0 grid-bg" />
        </div>
    );
}
