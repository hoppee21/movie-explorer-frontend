import { useEffect, useMemo, useRef, useState } from "react";

// --- Types ---
type Movie = {
  // Optional key (only present if in web_artifacts subset)
  movie_key?: string | null;
  title: string;
  year: number | null;
  region: string | null;
  imdb_id: string | null;
  douban_id: number | null;
  imdb_url: string | null;
  douban_url: string | null;

  // Ratings
  imdb_rating: number | null;
  imdb_votes: number | null;
  douban_rating: number | null;
  douban_votes: number | null;
  gap: number | null;

  // New Analytics (Nullable for standard movies)
  score: number | null;       // 0-100 (Discussion Difference)
  reliability: number | null; // 0-1 (Confidence)
};

type Theme = {
  cluster: number;
  share_gap: number;
  imdb_share: number;
  douban_share: number;
  imdb_terms: string[];
  douban_terms: string[];
};

type MovieDetails = {
  movie_key: string;
  themes: Theme[];
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
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toString();
};

const getGradient = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
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

const ThemeRow = ({ theme }: { theme: Theme }) => {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 flex flex-col gap-3">
      {/* Visual Share Bar */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <span className="w-12 text-right font-medium">IMDb</span>
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden flex relative">
          <div className="h-full bg-yellow-500 absolute left-0" style={{ width: `${theme.imdb_share * 100}%` }} />
          <div className="h-full bg-green-500 absolute right-0" style={{ width: `${theme.douban_share * 100}%` }} />
        </div>
        <span className="w-12 font-medium">Douban</span>
      </div>

      {/* Terms Comparison */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="text-right border-r border-gray-700 pr-4">
          <div className="flex flex-wrap justify-end gap-1">
            {theme.imdb_terms.slice(0, 5).map(t => (
              <span key={t} className="bg-yellow-500/10 text-yellow-200 px-1.5 py-0.5 rounded text-xs border border-yellow-500/20">{t}</span>
            ))}
          </div>
        </div>
        <div className="pl-4">
          <div className="flex flex-wrap gap-1">
            {theme.douban_terms.slice(0, 5).map(t => (
              <span key={t} className="bg-green-500/10 text-green-200 px-1.5 py-0.5 rounded text-xs border border-green-500/20">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const MovieDetailModal = ({ movie, onClose }: { movie: Movie | null, onClose: () => void }) => {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Check if this movie has advanced analytics (score/themes)
  const hasAnalytics = movie?.movie_key && movie.score !== null;

  useEffect(() => {
    if (!movie) return;

    // 1. Fetch Poster
    if (movie.imdb_id) {
      setPosterUrl(null);
      fetch(`${API_BASE}/movie/${movie.imdb_id}/poster`)
        .then(res => res.json())
        .then(data => data.url && setPosterUrl(data.url))
        .catch(err => console.error("Poster fetch failed", err));
    }

    // 2. Fetch Full Details (Only if analytics exist)
    if (hasAnalytics && movie.movie_key) {
      setLoadingDetails(true);
      fetch(`${API_BASE}/movie/${movie.movie_key}/details`)
        .then(res => res.json())
        .then(data => setDetails(data))
        .catch(err => console.error("Details fetch failed", err))
        .finally(() => setLoadingDetails(false));
    }
  }, [movie, hasAnalytics]);

  if (!movie) return null;
  const bgStyle = { background: getGradient(movie.title) };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className={`bg-gray-900 w-full rounded-3xl overflow-hidden shadow-2xl border border-gray-700 flex flex-col md:flex-row transition-all duration-300 max-h-[90vh] 
          ${hasAnalytics ? 'max-w-6xl' : 'max-w-2xl'}`} // Conditional Width
      >

        {/* Left Panel: Info & Poster */}
        <div className={`w-full bg-gray-800 relative flex flex-col border-r border-gray-700 ${hasAnalytics ? 'md:w-1/3' : 'md:w-full'}`}>
          <div className="relative h-64 md:h-1/2 w-full bg-gray-900 overflow-hidden shrink-0">
             {posterUrl ? (
               <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" />
             ) : (
               <div className="w-full h-full flex items-center justify-center" style={bgStyle}>
                 <span className="text-white/50 font-bold text-xl px-4 text-center">{movie.title}</span>
               </div>
             )}
             <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
             <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-2xl font-bold text-white leading-tight">{movie.title}</h2>
                <div className="flex gap-2 mt-2 text-sm text-gray-300">
                  <span className="bg-gray-700 px-2 rounded font-mono">{movie.year}</span>
                  <span className="uppercase tracking-wider opacity-75">{movie.region}</span>
                </div>
             </div>
             {/* Close Button (Visible on Mobile or if Single Column) */}
             <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full backdrop-blur text-white transition-colors">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto">
             {/* Scores */}
             <div className="space-y-3">
                <RatingBar label="IMDb" score={movie.imdb_rating} colorClass="bg-yellow-400" />
                <RatingBar label="Douban" score={movie.douban_rating} colorClass="bg-green-500" />
                {movie.gap !== null && (
                  <div className="flex justify-between text-xs pt-1 border-t border-gray-700/50 mt-2">
                    <span className="text-gray-400">Rating Gap</span>
                    <span className={`font-mono font-bold ${movie.gap > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {Math.abs(movie.gap).toFixed(2)}
                    </span>
                  </div>
                )}
             </div>

             {/* Analytics Badge (Only for High-Gap Movies) */}
             {hasAnalytics && (
               <div className="bg-gray-700/30 p-4 rounded-xl border border-gray-600/50">
                 <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">AI Analysis</div>

                 <div className="flex justify-between items-end mb-2">
                   <span className="text-sm font-medium text-gray-200">Discussion Diff</span>
                   <span className="text-2xl font-bold text-purple-400">{movie.score?.toFixed(0)}</span>
                 </div>
                 <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden mb-4">
                   <div className="bg-purple-500 h-full" style={{ width: `${movie.score}%` }} />
                 </div>

                 <div className="flex justify-between items-center text-xs border-t border-gray-600/30 pt-3">
                   <span className="text-gray-400">Confidence</span>
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        (movie.reliability || 0) > 0.8 ? 'bg-green-500' : (movie.reliability || 0) > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="text-gray-300 font-mono">{((movie.reliability || 0) * 100).toFixed(0)}%</span>
                   </div>
                 </div>
               </div>
             )}

             {/* Links */}
             <div className="flex gap-3 pt-2">
               {movie.imdb_url && (
                 <a href={movie.imdb_url} target="_blank" rel="noreferrer" className="flex-1 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 rounded text-center text-sm font-medium transition-colors">IMDb</a>
               )}
               {movie.douban_url && (
                 <a href={movie.douban_url} target="_blank" rel="noreferrer" className="flex-1 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/30 rounded text-center text-sm font-medium transition-colors">Douban</a>
               )}
             </div>
          </div>
        </div>

        {/* Right Panel: Theme Explorer (Only if Analytics Exist) */}
        {hasAnalytics && (
          <div className="w-full md:w-2/3 p-6 md:p-8 flex flex-col bg-gray-900 overflow-hidden border-l border-gray-800">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-white">Discussion Themes</h3>
                <p className="text-sm text-gray-500">What each audience focuses on</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors hidden md:block">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
               {loadingDetails ? (
                 <div className="flex flex-col items-center justify-center h-full text-gray-500">
                   <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                   Loading analysis...
                 </div>
               ) : details && details.themes && details.themes.length > 0 ? (
                 details.themes.map((theme) => (
                   <ThemeRow key={theme.cluster} theme={theme} />
                 ))
               ) : (
                 <div className="text-center text-gray-500 mt-12 bg-gray-800/50 p-8 rounded-xl border border-gray-800">
                   No specific thematic clusters found for this movie.
                 </div>
               )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

const MovieCard = ({ m, onClick }: { m: Movie, onClick: (m: Movie) => void }) => {
  const bgStyle = { background: getGradient(m.title) };
  // Check if we have analytics data
  const hasAnalytics = m.score !== null;

  return (
    <div
      onClick={() => onClick(m)}
      className="bg-gray-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-700 flex flex-col h-full cursor-pointer group relative"
    >
      <div className="h-32 w-full relative p-4 flex flex-col justify-end overflow-hidden" style={bgStyle}>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent opacity-90 transition-opacity group-hover:opacity-80" />
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-white leading-tight shadow-black drop-shadow-md group-hover:text-purple-300 transition-colors line-clamp-2">{m.title}</h3>
        </div>
      </div>

      {/* Analytics Badge (Absolute Top Right) - Only if score exists */}
      {hasAnalytics && (
        <div className="absolute top-2 right-2 flex gap-1">
          <div className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-mono text-purple-300 border border-purple-500/30 shadow-sm flex items-center gap-1" title="Discussion Difference Score">
             <span>Diff</span>
             <span className="font-bold text-white">{m.score?.toFixed(0)}</span>
          </div>
        </div>
      )}

      <div className="p-4 flex flex-col gap-4 flex-1">
        <div className="flex justify-between items-center text-xs text-gray-400">
           <span>{m.year || "N/A"}</span>

           {/* Confidence Dot - Only if reliability exists */}
           {hasAnalytics ? (
             <div className="flex items-center gap-1.5" title={`Analysis Confidence: ${((m.reliability||0)*100).toFixed(0)}%`}>
               <span>Conf</span>
               <div className={`w-2 h-2 rounded-full ${
                 (m.reliability || 0) > 0.8 ? 'bg-green-500' : (m.reliability || 0) > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
               }`} />
             </div>
           ) : (
             <span className="opacity-50">Standard Entry</span>
           )}
        </div>

        <div className="space-y-2 mt-auto">
          <RatingBar label="IMDb" score={m.imdb_rating} colorClass="bg-yellow-400" />
          <RatingBar label="Douban" score={m.douban_rating} colorClass="bg-green-500" />
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [q, setQ] = useState("");
  const [minReliability, setMinReliability] = useState(0.0);
  const [sort, setSort] = useState("score_desc");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const debouncedQ = useDebounce(q, 400);

  const [items, setItems] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 24;
  const hasMore = items.length < total;

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page_size", String(pageSize));
    params.set("sort", sort);
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    // Only send min_reliability if user actually moved the slider,
    // otherwise we might accidentally filter out all standard movies (which have reliability null)
    if (minReliability > 0) params.set("min_reliability", String(minReliability));
    return params.toString();
  }, [debouncedQ, minReliability, sort, pageSize]);

  async function loadPage(nextPage: number, replace = false) {
    if (!replace && loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/movies?${queryParams}&page=${nextPage}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Server Error");
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

      {selectedMovie && (
        <MovieDetailModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}

      {/* Header */}
      <div className="relative bg-gradient-to-b from-black to-gray-900 pb-12 pt-8 px-4 sm:px-8 border-b border-gray-800">
        <div className="max-w-7xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Movie Explorer
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Exploring {total > 0 ? total.toLocaleString() : "..."} films.
            <span className="block text-sm text-gray-500 mt-1">Comparing Western vs. Eastern Reception</span>
          </p>

          <div className="max-w-xl mx-auto relative">
             <input type="text" value={q} onChange={(e) => setQ(e.target.value)} className="block w-full rounded-full border-2 border-gray-700 bg-gray-800/50 py-4 px-6 text-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none transition-all shadow-xl backdrop-blur-sm" placeholder="Search for a movie..." />
          </div>

          <button onClick={() => setShowFilters(!showFilters)} className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors flex items-center justify-center gap-1 mx-auto">
            {showFilters ? "Hide Filters" : "Show Filters & Sort"}
            <svg className={`w-4 h-4 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto overflow-hidden transition-all duration-300 ${showFilters ? 'max-h-40 opacity-100 mt-6' : 'max-h-0 opacity-0'}`}>
              <div className="flex items-center gap-2 bg-gray-800 p-3 rounded-lg border border-gray-700">
                <span className="text-xs text-gray-400">Min Confidence:</span>
                <input
                  type="range" min="0" max="1" step="0.1"
                  value={minReliability} onChange={e => setMinReliability(parseFloat(e.target.value))}
                  className="flex-1 accent-purple-500"
                />
                <span className="text-xs font-mono w-8 text-right">{minReliability}</span>
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-purple-500 outline-none text-gray-300">
                <option value="score_desc">Most Different (High Gap)</option>
                <option value="score_asc">Most Similar (Low Gap)</option>
                <option value="reliability_desc">Highest Confidence</option>
                <option value="votes_desc">Most Popular</option>
                <option value="year_desc">Newest</option>
              </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        {error && <div className="mb-8 bg-red-900/20 border border-red-500/50 rounded-xl p-4 text-red-200 text-center">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((m) => (
             <MovieCard
               key={m.imdb_id || m.title} // Fallback key if movie_key missing
               m={m}
               onClick={setSelectedMovie}
             />
          ))}
        </div>

        <div ref={sentinelRef} className="py-12 flex justify-center items-center">
          {loading ? (
             <div className="flex flex-col items-center gap-3">
               <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
               <span className="text-gray-500 text-sm animate-pulse">Loading data...</span>
             </div>
          ) : !hasMore && items.length > 0 ? (
            <div className="text-gray-600 text-sm font-medium tracking-widest uppercase">End of list</div>
          ) : items.length === 0 && !loading && !error && (
            <div className="text-gray-500 text-lg">No movies found.</div>
          )}
        </div>
      </div>
    </div>
  );
}