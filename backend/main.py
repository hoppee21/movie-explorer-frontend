import os
import duckdb
import requests
from bs4 import BeautifulSoup
from typing import List, Optional, Literal, Dict
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
MOVIES_CSV = os.getenv("MOVIES_CSV", "data/final_movies_complete_only.csv")
DB_PATH = os.getenv("DB_PATH", "movies.duckdb")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# --- In-Memory Cache for Posters ---
# Stores {imdb_id: image_url} to avoid re-scraping
poster_cache: Dict[str, str] = {}


# --- Pydantic Models ---
class Movie(BaseModel):
    title: str
    year: Optional[int] = None
    region: Optional[str] = None
    imdb_id: Optional[str] = None
    imdb_url: Optional[str] = None
    douban_id: Optional[int] = None
    douban_url: Optional[str] = None
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
            table_exists = con.execute(
                "SELECT count(*) FROM information_schema.tables WHERE table_name = 'movies'"
            ).fetchone()[0] > 0

            if not table_exists:
                print(f"Loading data from {MOVIES_CSV}...")
                con.execute(f"""
                    CREATE TABLE movies AS
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
                        TRY_CAST(douban_votes AS BIGINT) AS douban_votes
                    FROM read_csv_auto('{MOVIES_CSV}', header=true, ignore_errors=true)
                """)
                con.execute("CREATE INDEX idx_movies_year ON movies(year)")
                con.execute("CREATE INDEX idx_movies_region ON movies(region)")
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
app = FastAPI(title="Movie Explorer API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "database": "connected" if con else "disconnected"}


# --- Scraper Endpoint ---
@app.get("/movie/{imdb_id}/poster", response_model=PosterResponse)
def get_movie_poster(imdb_id: str):
    # 1. Check Cache
    if imdb_id in poster_cache:
        return {"url": poster_cache[imdb_id]}

    # 2. Scrape IMDb
    # We use a User-Agent to look like a real browser, otherwise IMDb blocks requests.
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    url = f"https://www.imdb.com/title/{imdb_id}/"

    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            # The 'og:image' meta tag is the most reliable way to get the poster
            meta_image = soup.find("meta", property="og:image")
            if meta_image and meta_image.get("content"):
                poster_url = meta_image["content"]
                poster_cache[imdb_id] = poster_url  # Save to cache
                return {"url": poster_url}
    except Exception as e:
        print(f"Scraping failed for {imdb_id}: {e}")

    # Return null if failed
    return {"url": None}


# --- Main List Endpoint ---
SortOptions = Literal[
    "gap_desc", "gap_asc",
    "year_desc", "year_asc",
    "imdb_desc", "imdb_asc",
    "douban_desc", "douban_asc",
    "votes_desc"
]


@app.get("/movies", response_model=MovieResponse)
def list_movies(
        q: Optional[str] = Query(None),
        region: Optional[str] = Query(None),
        year_min: Optional[int] = Query(None, ge=1900),
        year_max: Optional[int] = Query(None, le=2100),
        min_imdb_votes: int = Query(0, ge=0),
        min_douban_votes: int = Query(0, ge=0),
        sort: SortOptions = "gap_desc",
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

    where_clauses.append("COALESCE(imdb_votes, 0) >= ?")
    params.append(min_imdb_votes)
    where_clauses.append("COALESCE(douban_votes, 0) >= ?")
    params.append(min_douban_votes)

    where_sql = " AND ".join(where_clauses)

    sort_map = {
        "gap_desc": "(douban_rating - imdb_rating) DESC NULLS LAST",
        "gap_asc": "(douban_rating - imdb_rating) ASC NULLS LAST",
        "year_desc": "year DESC NULLS LAST",
        "year_asc": "year ASC NULLS LAST",
        "imdb_desc": "imdb_rating DESC NULLS LAST",
        "imdb_asc": "imdb_rating ASC NULLS LAST",
        "douban_desc": "douban_rating DESC NULLS LAST",
        "douban_asc": "douban_rating ASC NULLS LAST",
        "votes_desc": "(COALESCE(imdb_votes,0) + COALESCE(douban_votes,0)) DESC",
    }
    order_sql = sort_map.get(sort, "year DESC")

    offset = (page - 1) * page_size

    try:
        total = db.execute(f"SELECT COUNT(*) FROM movies WHERE {where_sql}", params).fetchone()[0]

        query = f"""
            SELECT
                title, year, region,
                imdb_id, imdb_url, douban_id, douban_url,
                imdb_rating, imdb_votes, douban_rating, douban_votes,
                (douban_rating - imdb_rating) as gap
            FROM movies
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
        """
        rows = db.execute(query, params + [page_size, offset]).fetchall()

        items = [
            Movie(
                title=r[0], year=r[1], region=r[2],
                imdb_id=r[3], imdb_url=r[4], douban_id=r[5], douban_url=r[6],
                imdb_rating=r[7], imdb_votes=r[8], douban_rating=r[9], douban_votes=r[10],
                gap=r[11]
            ) for r in rows
        ]

        return MovieResponse(page=page, page_size=page_size, total=total, items=items)

    except Exception as e:
        print(f"Query Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Database Error")