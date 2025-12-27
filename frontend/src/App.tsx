import { useEffect, useMemo, useRef, useState } from "react";
import * as React from "react";

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

// --- Modal Component ---
const MovieDetailModal = ({ movie, onClose }: { movie: Movie | null, onClose: () => void }) => {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [loadingPoster, setLoadingPoster] = useState(false);

  // Fetch poster when movie opens
  useEffect(() => {
    if (!movie || !movie.imdb_id) return;

    setPosterUrl(null); // Reset prev image
    setLoadingPoster(true);

    fetch(`${API_BASE}/movie/${movie.imdb_id}/poster`)
      .then(res => res.json())
      .then(data => {
        if (data.url) setPosterUrl(data.url);
      })
      .catch(err => console.error("Failed to fetch poster", err))
      .finally(() => setLoadingPoster(false));

  }, [movie]);

  if (!movie) return null;

  const bgStyle = { background: getGradient(movie.title) };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border border-gray-700 flex flex-col md:flex-row max-h-[90vh]"
        onClick={e => e.stopPropagation()} // Prevent close when clicking inside
      >

        {/* Poster Section (Scraped Image) */}
        <div className="w-full md:w-2/5 h-64 md:h-auto bg-gray-800 relative overflow-hidden flex items-center justify-center">
          {posterUrl ? (
             <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 p-6 flex flex-col justify-end" style={bgStyle}>
               <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-gray-900/40 to-transparent" />
               <div className="relative z-10">
                 {loadingPoster ? (
                    <div className="flex items-center gap-2 text-purple-300 animate-pulse">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm font-medium">Loading...</span>
                    </div>
                 ) : (
                    <span className="text-gray-400 text-sm">No Poster Found</span>
                 )}
               </div>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="w-full md:w-3/5 p-6 md:p-8 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-3xl font-bold text-white leading-tight">{movie.title}</h2>
              <div className="flex items-center gap-3 mt-2 text-gray-400">
                <span className="bg-gray-800 px-2 py-1 rounded text-sm font-mono">{movie.year || "Unknown"}</span>
                <span>{movie.region}</span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 my-6 bg-gray-800/50 p-6 rounded-xl border border-gray-700/50">
             <div className="space-y-1">
                <div className="text-xs text-gray-400 uppercase tracking-wider">IMDb Rating</div>
                <div className="text-3xl font-bold text-yellow-400">{movie.imdb_rating?.toFixed(1) || "—"}</div>
                <div className="text-sm text-gray-500">{formatNumber(movie.imdb_votes)} votes</div>
             </div>
             <div className="space-y-1">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Douban Rating</div>
                <div className="text-3xl font-bold text-green-500">{movie.douban_rating?.toFixed(1) || "—"}</div>
                <div className="text-sm text-gray-500">{formatNumber(movie.douban_votes)} votes</div>
             </div>
          </div>

          <div className="space-y-4">
             {/* Gap Analysis */}
             {movie.gap !== null && (
               <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">Cultural Gap</span>
                    <span className={`text-sm font-bold ${movie.gap > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                       {movie.gap > 0 ? "Douban Preference" : "IMDb Preference"} ({Math.abs(movie.gap).toFixed(2)})
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden relative">
                     {/* Center Marker */}
                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-500 z-10"></div>
                     <div
                        className={`h-full absolute transition-all duration-500 ${movie.gap > 0 ? 'bg-green-500 left-1/2' : 'bg-yellow-400 right-1/2'}`}
                        style={{ width: `${Math.min(Math.abs(movie.gap) * 20, 50)}%` }} // Scale: 5 points = 100% width half
                     ></div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500 italic">
                    {movie.gap > 1.0 ? "Significant difference in reception. Likely due to cultural context or translation." : "Both audiences generally agree on this film."}
                  </p>
               </div>
             )}
          </div>

          <div className="mt-auto pt-8 flex gap-4">
             {movie.imdb_url && (
               <a href={movie.imdb_url} target="_blank" rel="noreferrer" className="flex-1 py-3 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/50 rounded-lg text-center font-medium transition-colors">
                 View on IMDb
               </a>
             )}
             {movie.douban_url && (
               <a href={movie.douban_url} target="_blank" rel="noreferrer" className="flex-1 py-3 bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/50 rounded-lg text-center font-medium transition-colors">
                 View on Douban
               </a>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MovieCard = ({ m, onClick }: { m: Movie, onClick: (m: Movie) => void }) => {
  const bgStyle = { background: getGradient(m.title) };

  return (
    <div
      onClick={() => onClick(m)}
      className="bg-gray-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-700 flex flex-col h-full cursor-pointer group"
    >
      <div className="h-32 w-full relative p-4 flex flex-col justify-end overflow-hidden" style={bgStyle}>
        <div className="absolute inset-0 bg-linear-to-t from-gray-900 to-transparent opacity-90 transition-opacity group-hover:opacity-80" />
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-white leading-tight shadow-black drop-shadow-md group-hover:text-purple-300 transition-colors">{m.title}</h3>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-300">
            <span className="bg-gray-900/50 px-2 py-0.5 rounded backdrop-blur-sm">{m.year || "N/A"}</span>
            {m.region && <span className="uppercase tracking-wider opacity-80">{m.region}</span>}
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1">
        {m.gap !== null && Math.abs(m.gap) > 0.5 && (
            <div className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded self-start ${m.gap > 0 ? 'bg-emerald-900 text-emerald-300 border border-emerald-700' : 'bg-rose-900 text-rose-300 border border-rose-700'}`}>
             {m.gap > 0 ? "Local Favorite" : "Western Favorite"} ({m.gap > 0 ? "+" : ""}{m.gap.toFixed(1)})
            </div>
        )}

        <div className="space-y-2 mt-auto">
          <RatingBar label="IMDb" score={m.imdb_rating} colorClass="bg-yellow-400" />
          <RatingBar label="Douban" score={m.douban_rating} colorClass="bg-green-500" />
        </div>
      </div>
    </div>
  );
};

export default function App() {
  // --- State ---
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [sort, setSort] = useState("votes_desc");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const debouncedQ = useDebounce(q, 400);
  const debouncedRegion = useDebounce(region, 400);
  const debouncedYearMin = useDebounce(yearMin, 400);
  const debouncedYearMax = useDebounce(yearMax, 400);

  const [items, setItems] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 24;
  const hasMore = items.length < total;

  // --- Handlers ---
  const handleYearInput = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d{0,4}$/.test(val)) setter(val);
  };

  // --- Fetching ---
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page_size", String(pageSize));
    params.set("sort", sort);
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (debouncedRegion.trim()) params.set("region", debouncedRegion.trim());
    if (debouncedYearMin.trim()) params.set("year_min", debouncedYearMin.trim());
    if (debouncedYearMax.trim()) params.set("year_max", debouncedYearMax.trim());
    return params.toString();
  }, [debouncedQ, debouncedRegion, debouncedYearMin, debouncedYearMax, sort, pageSize]);

  async function loadPage(nextPage: number, replace = false) {
    if (!replace && loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/movies?${queryParams}&page=${nextPage}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status === 422 ? "Invalid filters." : "Server Error");
      const data = (await res.json()) as ApiResp;
      setTotal(data.total);
      setPage(data.page);
      setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setPage(1);
    setTotal(0);
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && hasMore && !error) loadPage(page + 1, false);
    }, { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [page, loading, hasMore, error]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-purple-500 selection:text-white">

      {/* Detail Modal */}
      {selectedMovie && (
        <MovieDetailModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}

      {/* Header */}
      <div className="relative bg-linear-to-b from-black to-gray-900 pb-12 pt-8 px-4 sm:px-8 border-b border-gray-800">
        <div className="max-w-7xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-linear-to-r from-purple-400 to-pink-600">
            Movie Explorer
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Discover {total > 0 ? total.toLocaleString() : "..."} films. Compare global tastes between IMDb and Douban.
          </p>

          <div className="max-w-xl mx-auto relative">
             <input type="text" value={q} onChange={(e) => setQ(e.target.value)} className="block w-full rounded-full border-2 border-gray-700 bg-gray-800/50 py-4 px-6 text-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none transition-all shadow-xl backdrop-blur-sm" placeholder="Search for a movie..." />
          </div>

          <button onClick={() => setShowFilters(!showFilters)} className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors flex items-center justify-center gap-1 mx-auto">
            {showFilters ? "Hide Filters" : "Show Filters & Sort"}
            <svg className={`w-4 h-4 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          <div className={`grid grid-cols-1 sm:grid-cols-4 gap-4 max-w-4xl mx-auto overflow-hidden transition-all duration-300 ${showFilters ? 'max-h-40 opacity-100 mt-6' : 'max-h-0 opacity-0'}`}>
              <input value={region} onChange={(e) => setRegion(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none" placeholder="Region (e.g. US)" />
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" value={yearMin} onChange={handleYearInput(setYearMin)} className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none" placeholder="Min Year" />
                <input type="text" inputMode="numeric" value={yearMax} onChange={handleYearInput(setYearMax)} className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none" placeholder="Max Year" />
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
        {error && <div className="mb-8 bg-red-900/20 border border-red-500/50 rounded-xl p-4 text-red-200 text-center">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((m, idx) => (
             <MovieCard key={`${m.imdb_id}-${idx}`} m={m} onClick={setSelectedMovie} />
          ))}
        </div>

        <div ref={sentinelRef} className="py-12 flex justify-center items-center">
          {loading ? (
             <div className="flex flex-col items-center gap-3">
               <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
               <span className="text-gray-500 text-sm animate-pulse">Fetching movies...</span>
             </div>
          ) : !hasMore && items.length > 0 ? (
            <div className="text-gray-600 text-sm font-medium tracking-widest uppercase">End of the reel</div>
          ) : items.length === 0 && !loading && !error && (
            <div className="text-gray-500 text-lg">No movies found.</div>
          )}
        </div>
      </div>
    </div>
  );
}