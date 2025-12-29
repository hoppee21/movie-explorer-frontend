import os
import json
import duckdb
import requests
from bs4 import BeautifulSoup
from typing import List, Optional, Literal, Dict, Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
# 1. Primary Data Source (The Full List)
MOVIES_CSV = os.getenv("MOVIES_CSV", "data/final_movies_complete_only.csv")

# 2. Analytics Data Source (The Subset with Gap > 1.5)
WEB_ARTIFACTS_DIR = os.getenv("WEB_ARTIFACTS_DIR", "data/web_artifacts")
MOVIES_PARQUET = os.path.join(WEB_ARTIFACTS_DIR, "movies.parquet")
DETAILS_DIR = os.path.join(WEB_ARTIFACTS_DIR, "movie_details")

DB_PATH = os.getenv("DB_PATH", ":memory:")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# --- In-Memory Cache for Posters ---
poster_cache: Dict[str, str] = {}


# --- Pydantic Models ---
class Movie(BaseModel):
    # movie_key is now Optional because standard movies won't have one
    movie_key: Optional[str] = None
    title: str
    year: Optional[int] = None
    region: Optional[str] = None
    imdb_id: Optional[str] = None
    douban_id: Optional[int] = None
    imdb_url: Optional[str] = None
    douban_url: Optional[str] = None

    # Analytics Metrics (Only present for high-gap movies)
    score: Optional[float] = None
    reliability: Optional[float] = None

    # Ratings
    imdb_rating: Optional[float] = None
    imdb_votes: Optional[int] = None
    douban_rating: Optional[float] = None
    douban_votes: Optional[int] = None
    gap: Optional[float] = None


class MovieResponse(BaseModel):
    page: int
    page_size: int
    total: int
    items: List[Movie]


class PosterResponse(BaseModel):
    url: Optional[str]


# --- Database Connection ---
con: duckdb.DuckDBPyConnection = None


def get_db():
    global con
    if con is None:
        try:
            con = duckdb.connect(DB_PATH)
            con.execute("PRAGMA threads=8")

            print(f"1. Loading Base Data from {MOVIES_CSV}...")
            # Load the full dataset (30k rows)
            con.execute(f"""
                CREATE TABLE base_movies AS
                SELECT
                    label::VARCHAR AS title,
                    TRY_CAST(year AS INTEGER) AS year,
                    region::VARCHAR AS region,
                    imdb_id::VARCHAR AS imdb_id,
                    imdb_url::VARCHAR AS imdb_url,
                    TRY_CAST(douban_id AS BIGINT) AS douban_id,
                    COALESCE(douban_url_y, douban_url_x)::VARCHAR AS douban_url,
                    TRY_CAST(imdb_rating AS DOUBLE) AS imdb_rating,
                    TRY_CAST(imdb_votes AS BIGINT) AS imdb_votes,
                    TRY_CAST(douban_rating AS DOUBLE) AS douban_rating,
                    TRY_CAST(douban_votes AS BIGINT) AS douban_votes,
                    (douban_rating - imdb_rating) AS gap
                FROM read_csv_auto('{MOVIES_CSV}', header=true, ignore_errors=true)
            """)

            print(f"2. Loading Analytics from {MOVIES_PARQUET}...")
            # Load the subset (High gap movies)
            # We wrap this in try/catch in case the artifacts folder isn't there yet
            has_analytics = False
            try:
                con.execute(f"""
                    CREATE TABLE analytics_subset AS 
                    SELECT * FROM read_parquet('{MOVIES_PARQUET}')
                """)
                has_analytics = True
            except Exception as e:
                print(f"Warning: Could not load analytics parquet ({e}). Proceeding with base data only.")

            # Create the Unified View
            print("3. Creating Unified 'movies' Table...")
            if has_analytics:
                # Left Join base with analytics on IMDb ID
                con.execute("""
                    CREATE TABLE movies AS
                    SELECT
                        b.*,
                        a.movie_key,
                        a.score,
                        a.reliability
                    FROM base_movies b
                    LEFT JOIN analytics_subset a ON b.imdb_id = a.imdb_id
                """)
            else:
                # Fallback if no parquet
                con.execute("""
                    CREATE TABLE movies AS
                    SELECT *, NULL::VARCHAR as movie_key, NULL::DOUBLE as score, NULL::DOUBLE as reliability 
                    FROM base_movies
                """)

            # Indexes for speed
            con.execute("CREATE INDEX IF NOT EXISTS idx_year ON movies(year)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_score ON movies(score)")
            con.execute("CREATE INDEX IF NOT EXISTS idx_imdb ON movies(imdb_id)")

            print("Database initialized successfully.")
        except Exception as e:
            print(f"Database initialization failed: {e}")
            raise e
    return con


# --- Lifespan Manager ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db()
    yield
    global con
    if con:
        con.close()
        con = None


# --- App Setup ---
app = FastAPI(title="Movie Explorer API", version="2.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "mode": "hybrid"}


# --- Endpoints ---

@app.get("/movie/{movie_key}/details")
def get_movie_details(movie_key: str):
    """
    Reads JSON detail file. Only works if movie_key exists (i.e. movie is in subset).
    """
    if not movie_key or movie_key == "None":
        raise HTTPException(status_code=404, detail="No details available for this movie")

    file_path = os.path.join(DETAILS_DIR, f"{movie_key}.json")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Details file not found")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        print(f"Error reading details for {movie_key}: {e}")
        raise HTTPException(status_code=500, detail="Error reading detail file")


@app.get("/movie/{imdb_id}/poster", response_model=PosterResponse)
def get_movie_poster(imdb_id: str):
    if not imdb_id or imdb_id == "None":
        return {"url": None}

    if imdb_id in poster_cache:
        return {"url": poster_cache[imdb_id]}

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    url = f"https://www.imdb.com/title/{imdb_id}/"

    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            meta_image = soup.find("meta", property="og:image")
            if meta_image and meta_image.get("content"):
                poster_url = meta_image["content"]
                poster_cache[imdb_id] = poster_url
                return {"url": poster_url}
    except Exception as e:
        print(f"Scraping failed for {imdb_id}: {e}")

    return {"url": None}


# --- List Endpoint ---
SortOptions = Literal[
    "score_desc", "score_asc",
    "reliability_desc",
    "gap_desc", "gap_asc",
    "year_desc", "year_asc",
    "imdb_desc", "douban_desc",
    "votes_desc"
]


@app.get("/movies", response_model=MovieResponse)
def list_movies(
        q: Optional[str] = Query(None),
        region: Optional[str] = Query(None),
        year_min: Optional[int] = Query(None, ge=1900),
        year_max: Optional[int] = Query(None, le=2100),
        min_reliability: float = Query(0.0, ge=0.0, le=1.0),
        sort: SortOptions = "score_desc",
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
):
    db = get_db()

    where_clauses = ["1=1"]
    params = []

    if q:
        where_clauses.append("lower(title) LIKE lower(?)")
        params.append(f"%{q}%")

    if region:
        where_clauses.append("region = ?")
        params.append(region)
    if year_min is not None:
        where_clauses.append("year >= ?")
        params.append(year_min)
    if year_max is not None:
        where_clauses.append("year <= ?")
        params.append(year_max)

    if min_reliability > 0:
        where_clauses.append("reliability >= ?")
        params.append(min_reliability)

    where_sql = " AND ".join(where_clauses)

    # Sorting Logic
    sort_map = {
        "score_desc": "score DESC NULLS LAST",  # Analytics movies first
        "score_asc": "score ASC NULLS LAST",
        "reliability_desc": "reliability DESC NULLS LAST",
        "gap_desc": "abs(gap) DESC NULLS LAST",
        "year_desc": "year DESC NULLS LAST",
        "imdb_desc": "imdb_rating DESC NULLS LAST",
        "douban_desc": "douban_rating DESC NULLS LAST",
        "votes_desc": "(COALESCE(imdb_votes,0) + COALESCE(douban_votes,0)) DESC",
    }

    order_sql = sort_map.get(sort, "score DESC NULLS LAST")

    offset = (page - 1) * page_size

    try:
        total = db.execute(f"SELECT COUNT(*) FROM movies WHERE {where_sql}", params).fetchone()[0]

        # We assume specific columns exist because we created the table explicitly above
        query = f"""
            SELECT *
            FROM movies
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
        """

        result = db.execute(query, params + [page_size, offset])
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()

        items = []
        for row in rows:
            row_dict = dict(zip(columns, row))
            items.append(Movie(
                movie_key=row_dict.get('movie_key'),  # Might be None for non-subset movies
                title=row_dict.get('title', 'Unknown'),
                year=row_dict.get('year'),
                region=row_dict.get('region'),
                imdb_id=row_dict.get('imdb_id'),
                douban_id=row_dict.get('douban_id'),
                imdb_url=row_dict.get('imdb_url'),
                douban_url=row_dict.get('douban_url'),
                score=row_dict.get('score'),
                reliability=row_dict.get('reliability'),
                imdb_rating=row_dict.get('imdb_rating'),
                imdb_votes=row_dict.get('imdb_votes'),
                douban_rating=row_dict.get('douban_rating'),
                douban_votes=row_dict.get('douban_votes'),
                gap=row_dict.get('gap')
            ))

        return MovieResponse(page=page, page_size=page_size, total=total, items=items)

    except Exception as e:
        print(f"Query Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database Error: {str(e)}")