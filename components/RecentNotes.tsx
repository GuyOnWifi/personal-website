// Pulls the latest notes from the Quartz digital garden (notes.easonhuang.dev)
// via its RSS feed and shows them as a callout card. Server component with ISR;
// if the feed is unreachable it renders nothing.

const FEED_URL = "https://notes.easonhuang.dev/index.xml";
const NOTES_URL = "https://notes.easonhuang.dev";
const MAX_ITEMS = 6;

interface NoteItem {
    title: string;
    link: string;
    date: string;
}

const decodeEntities = (s: string) =>
    s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"');

const formatDate = (raw: string) => {
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d
        .toLocaleDateString("en-US", { month: "short", year: "numeric" })
        .toLowerCase();
};

function parseFeed(xml: string): NoteItem[] {
    const items: NoteItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const pick = (block: string, tag: string) =>
        block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? "";
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml))) {
        const block = m[1];
        const title = decodeEntities(pick(block, "title"));
        const link = pick(block, "link");
        if (title && link) {
            items.push({ title, link, date: formatDate(pick(block, "pubDate")) });
        }
    }
    return items;
}

async function getNotes(): Promise<NoteItem[]> {
    try {
        const res = await fetch(FEED_URL, { next: { revalidate: 3600 } });
        if (!res.ok) return [];
        return parseFeed(await res.text()).slice(0, MAX_ITEMS);
    } catch {
        return [];
    }
}

export default async function RecentNotes() {
    const notes = await getNotes();
    if (notes.length === 0) return null;

    return (
        <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] backdrop-blur-sm p-8 transition-colors hover:border-accent/25">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <span aria-hidden>🌱</span> i also keep a digital garden
            </h2>
            <p className="mt-2 max-w-xl opacity-60 text-sm leading-relaxed">
                loose, evergreen notes on what i&apos;m learning. rougher and more
                frequent than the posts above.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                {notes.map((note) => (
                    <a
                        key={note.link}
                        href={note.link}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-3 py-1 opacity-80 hover:opacity-100 hover:border-accent/40 hover:text-accent transition-all"
                    >
                        {note.title}
                    </a>
                ))}
            </div>

            <a
                href={NOTES_URL}
                target="_blank"
                rel="noreferrer"
                className="group mt-6 inline-flex items-center gap-1 text-accent text-sm font-semibold hover:underline underline-offset-4"
            >
                explore notes
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </a>
        </section>
    );
}
