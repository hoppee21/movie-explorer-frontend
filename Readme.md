# Movie Explorer 🎬

A scalable, full-stack web application for exploring and analyzing movie ratings across cultures. It compares IMDb (Western) vs. Douban (Eastern) ratings to highlight cultural differences in film reception.

## Features

* **High Performance:** Backend powered by **FastAPI** and **DuckDB** (OLAP SQL engine) to filter and sort ~30k+ rows instantly.
* **Modern UI:** **React** + **Vite** frontend with **Tailwind CSS v4** for a "Cinema Dark Mode" aesthetic.
* **Infinite Scroll:** Efficient server-side pagination handled seamlessly in the UI.
* **Live Scraper:** "Just-in-time" scraping of movie posters from IMDb when viewing movie details.
* **Cultural Gap Analysis:** Visual indicators showing whether a film is preferred by Western or Eastern audiences.

## Project Structure

```text
movie-explorer/
├── backend/
│   ├── data/                  # Film data and source data
│   ├── main.py                # FastAPI application & logic
│   ├── requirements.txt       # Python dependencies
│   └── movies.duckdb          # Generated database file
└── frontend/
    ├── src/
    │   ├── App.tsx            # Main React UI
    │   ├── main.tsx           # Entry point
    │   └── index.css          # Tailwind imports
    ├── vite.config.ts         # Vite configuration
    ├── index.html             # HTML template
    ├── tsconfig.json          # TypeScript configuration
    ├── tsconfig.node.json     # TypeScript configuration for Node.js
    └── package.json
```

## Getting Started 🚀 

### Prerequisites

* **Python 3.10+**

* **Node.js 18+** (for frontend)