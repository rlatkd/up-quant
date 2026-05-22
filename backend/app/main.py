from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import markets, candles, analysis, backtest

app = FastAPI(title="UPquant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets.router)
app.include_router(candles.router)
app.include_router(analysis.router)
app.include_router(backtest.router)


@app.get("/health")
def health():
    return {"status": "ok"}
