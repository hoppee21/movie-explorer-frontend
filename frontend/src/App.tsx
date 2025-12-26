import { useEffect, useMemo, useRef, useState } from "react";

// --- Types ---
type Movie = {
  title: string;
  year: number | null;
  region: string | null;
  imdb_id: string | null;
  imdb_url: string | null;
  douban_id: number | null;
  douban_url: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  douban_rating: number | null;
  douban_votes: number | null;
  gap: number | null;
};

type ApiResp = {
  page: number;
  page_size: number;
  total: number;
  items: Movie[];
};

const API_BASE = "http://localhost:8000";

// --- Utils ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Manual number formatter to avoid TS2353 (notation property missing in older TS libs)
const formatNumber = (num: number | null | undefined) => {
  if (num === null || num === undefined) return "—";
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return num.toString();
};

// Generate a deterministic gradient based on the movie title
const getGradient = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c1 = `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
  const c2 = `hsl(${Math.abs(hash >> 8) % 360}, 70%, 40%)`;
  return `linear-gradient(135deg, ${c1}, ${c2})`;
};

// --- Components ---

const RatingBar = ({ label, score, colorClass }: { label: string, score: number | null, colorClass: string }) => {
  if (score === null) return null;
  const pct = (score / 10) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 font-bold text-gray-400">{label}</span>
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-gray-300 font-mono">{score.toFixed(1)}</span>
    </div>
  );
};

const MovieCard = ({ m }: { m: Movie }) => {
  const bgStyle = { background: getGradient(m.title) };

  return (
    <div className="bg-gray-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-700 flex flex-col h-full">
      {/* Abstract Poster */}
      <div className="h-32 w-full relative p-4 flex flex-col justify-end" style={bgStyle}>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent opacity-90" />
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-white leading-tight shadow-black drop-shadow-md">{m.title}</h3>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-300">
            <span className="bg-gray-900/50 px-2 py-0.5 rounded backdrop-blur-sm">{m.year || "N/A"}</span>
            {m.region && <span className="uppercase tracking-wider opacity-80">{m.region}</span>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-4 flex-1">

        {/* Gap Badge */}
        {m.gap !== null && Math.abs(m.gap) > 0.5 && (
            <div className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded self-start ${m.gap > 0 ? 'bg-emerald-900 text-emerald-300 border border-emerald-700' : 'bg-rose-900 text-rose-300 border border-rose-700'}`}>
             {m.gap > 0 ? "Local Favorite" : "Western Favorite"} ({m.gap > 0 ? "+" : ""}{m.gap.toFixed(1)})
            </div>
        )}

        {/* Ratings */}
        <div className="space-y-2 mt-auto">
          <RatingBar label="IMDb" score={m.imdb_rating} colorClass="bg-yellow-400" />
          <RatingBar label="Douban" score={m.douban_rating} colorClass="bg-green-500" />
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-700 mt-2">
          <div className="text-xs text-gray-500">
             {formatNumber((m.imdb_votes || 0) + (m.douban_votes || 0))} votes
          </div>
          <div className="flex gap-3">
            {m.imdb_url && <a href={m.imdb_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-yellow-400 transition-colors">IMDb ↗</a>}
            {m.douban_url && <a href={m.douban_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-green-400 transition-colors">Douban ↗</a>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  // State
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 400);
  const [showFilters, setShowFilters] = useState(false);

  const [region, setRegion] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [sort, setSort] = useState("votes_desc");

  const [items, setItems] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 24; // Smaller page size for grid layout
  const hasMore = items.length < total;

  // Derived query string
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page_size", String(pageSize));
    params.set("sort", sort);
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (region.trim()) params.set("region", region.trim());
    if (yearMin.trim()) params.set("year_min", yearMin.trim());
    if (yearMax.trim()) params.set("year_max", yearMax.trim());
    return params.toString();
  }, [debouncedQ, region, yearMin, yearMax, sort, pageSize]);

  // Data Fetching
  // @ts-ignore
    async function loadPage(nextPage: number, replace = false) {
    if (!replace && loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/movies?${queryParams}&page=${nextPage}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server Error: ${res.status}`);
      const data = (await res.json()) as ApiResp;

      setTotal(data.total);
      setPage(data.page);
      setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  // Reset when filters change
  useEffect(() => {
    setItems([]);
    setPage(1);
    setTotal(0);
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams]);

  // Infinite Scroll Observer
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && hasMore) {
          loadPage(page + 1, false);
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [page, loading, hasMore]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-purple-500 selection:text-white">

      {/* Hero / Header Section */}
      <div className="relative bg-gradient-to-b from-black to-gray-900 pb-12 pt-8 px-4 sm:px-8 border-b border-gray-800">
        <div className="max-w-7xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Movie Explorer
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Discover {total > 0 ? total.toLocaleString() : "..."} films. Compare global tastes between IMDb and Douban.
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative">
             <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="block w-full rounded-full border-2 border-gray-700 bg-gray-800/50 py-4 px-6 text-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-purple-500 focus:outline-none transition-all shadow-xl backdrop-blur-sm"
                placeholder="Search for a movie..."
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
          </div>

          {/* Toggle Filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors flex items-center justify-center gap-1 mx-auto"
          >
            {showFilters ? "Hide Filters" : "Show Filters & Sort"}
            <svg className={`w-4 h-4 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {/* Collapsible Filter Panel */}
          <div className={`grid grid-cols-1 sm:grid-cols-4 gap-4 max-w-4xl mx-auto overflow-hidden transition-all duration-300 ${showFilters ? 'max-h-40 opacity-100 mt-6' : 'max-h-0 opacity-0'}`}>
              <input value={region} onChange={(e) => setRegion(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none" placeholder="Region (e.g. US)" />
              <div className="flex gap-2">
                <input type="number" value={yearMin} onChange={(e) => setYearMin(e.target.value)} className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none" placeholder="Min Year" />
                <input type="number" value={yearMax} onChange={(e) => setYearMax(e.target.value)} className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none" placeholder="Max Year" />
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="sm:col-span-2 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none text-gray-300">
                <option value="votes_desc">Most Popular</option>
                <option value="gap_desc">Prefer Douban (Gap ↓)</option>
                <option value="gap_asc">Prefer IMDb (Gap ↑)</option>
                <option value="imdb_desc">Highest IMDb</option>
                <option value="douban_desc">Highest Douban</option>
                <option value="year_desc">Newest</option>
              </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        {/* Error Banner */}
        {error && (
          <div className="mb-8 bg-red-900/20 border border-red-500/50 rounded-xl p-4 text-red-200 text-center">
            {error}
          </div>
        )}

        {/* The Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((m, idx) => (
             <MovieCard key={`${m.imdb_id}-${idx}`} m={m} />
          ))}
        </div>

        {/* Loading / Sentinel */}
        <div ref={sentinelRef} className="py-12 flex justify-center items-center">
          {loading ? (
             <div className="flex flex-col items-center gap-3">
               <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
               <span className="text-gray-500 text-sm animate-pulse">Fetching movies...</span>
             </div>
          ) : !hasMore && items.length > 0 ? (
            <div className="text-gray-600 text-sm font-medium tracking-widest uppercase">End of the reel</div>
          ) : items.length === 0 && !loading && (
            <div className="text-gray-500 text-lg">No movies found. Try a different search?</div>
          )}
        </div>

      </div>
    </div>
  );
}