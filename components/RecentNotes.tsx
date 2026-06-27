// Pulls the latest notes from the Quartz digital garden (notes.easonhuang.dev)
// via its RSS feed and shows them as a small strip on the homepage. Server
// component with ISR; if the feed is unreachable it renders nothing.

const FEED_URL = "https://notes.easonhuang.dev/index.xml";
const NOTES_URL = "https://notes.easonhuang.dev";
const MAX_ITEMS = 5;

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
        <section className="mb-8">
            <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
                <span className="text-accent animate-pulse">❄</span>
                from my notes:
                <a
                    href={NOTES_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs font-normal opacity-50 hover:opacity-100 hover:text-accent transition-all"
                >
                    all notes →
                </a>
            </h2>

            <div className="space-y-3 ml-2">
                {notes.map((note) => (
                    <a
                        key={note.link}
                        href={note.link}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start gap-2 text-sm"
                    >
                        <span className="opacity-40 group-hover:opacity-100 transition-opacity mt-[2px]">
                            ↳
                        </span>
                        <span className="opacity-70 underline decoration-foreground/20 decoration-1 underline-offset-4 group-hover:text-accent group-hover:decoration-accent transition-all">
                            {note.title}
                        </span>
                        {note.date && (
                            <span className="opacity-40 text-[12px] mt-[2px] whitespace-nowrap">
                                {note.date}
                            </span>
                        )}
                    </a>
                ))}
            </div>
        </section>
    );
}
