from __future__ import annotations

import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import groq as groq_sdk
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    AIQuery,
    AIResponse,
    CityForecast,
    CityMetrics,
    EnergyFlowResponse,
    PredictRequest,
    PredictResponse,
    Recommendation,
    SimulateInput,
    ZonePrediction,
)
from .simulation import state

app = FastAPI(title="Flux Grid API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_last_cities: list[CityMetrics] = []


def _refresh(body: SimulateInput | None = None) -> list[CityMetrics]:
    global _last_cities
    if body is not None:
        state.set_params(body)
    _last_cities = state.compute_cities()
    return _last_cities


@app.on_event("startup")
def startup() -> None:
    _refresh()


@app.get("/city-state", response_model=list[CityMetrics])
def city_state() -> list[CityMetrics]:
    if not _last_cities:
        _refresh()
    return _last_cities


@app.post("/simulate", response_model=list[CityMetrics])
def simulate(body: SimulateInput) -> list[CityMetrics]:
    return _refresh(body)


@app.get("/forecast", response_model=list[CityForecast])
def forecast() -> list[CityForecast]:
    if not _last_cities:
        _refresh()
    return state.forecast(_last_cities)


@app.get("/energy-flow", response_model=EnergyFlowResponse)
def energy_flow() -> EnergyFlowResponse:
    if not _last_cities:
        _refresh()
    flows = state.compute_flows(_last_cities)
    return EnergyFlowResponse(flows=flows)


@app.get("/recommendations", response_model=list[Recommendation])
def recommendations() -> list[Recommendation]:
    if not _last_cities:
        _refresh()
    flows = state.compute_flows(_last_cities)
    return state.recommendations(_last_cities, flows)


@app.post("/ai-query", response_model=AIResponse)
def ai_query(body: AIQuery) -> AIResponse:
    if not _last_cities:
        _refresh()
    flows = state.compute_flows(_last_cities)
    text, structured = state.answer_ai(body.query, _last_cities, flows)
    return AIResponse(answer=text, structured=structured)


@app.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest) -> PredictResponse:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not set")

    client = groq_sdk.Groq(api_key=api_key)
    zones_json = json.dumps([z.model_dump() for z in body.zones], indent=2)

    try:
        message = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2048,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an energy grid AI analyst. Given zone inputs, return ONLY a valid JSON array "
                        "with one prediction object per zone. No markdown, no explanation — raw JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Predict demand for each zone. Return a JSON array where each element has:\n"
                        "  zone_id (string), predicted_demand_mw (number), confidence_lower (number),\n"
                        "  confidence_upper (number), risk_score (0.0-1.0), forecast_peak_mw (number),\n"
                        "  forecast_trough_mw (number)\n\n"
                        "Rules:\n"
                        "- Solar/wind zones: predicted_demand_mw is generation output (can be 0 at night)\n"
                        "- Surge stress raises demand significantly; outage drops it toward 0\n"
                        "- Higher temperature → more residential/commercial demand\n"
                        "- risk_score reflects volatility: 0=stable, 1=very risky\n\n"
                        f"Zone inputs:\n{zones_json}"
                    ),
                },
            ],
        )
    except groq_sdk.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid GROQ_API_KEY — check your key and restart the backend")
    except groq_sdk.APIConnectionError as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach Groq API: {exc}")
    except groq_sdk.RateLimitError:
        raise HTTPException(status_code=429, detail="Groq rate limit hit — try again in a moment")
    except groq_sdk.APIStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Groq API error {exc.status_code}: {exc.message}")

    raw = message.choices[0].message.content.strip()
    # Strip markdown code fences if Claude wrapped the JSON
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)

    try:
        parsed = json.loads(raw)
        predictions = [ZonePrediction(**p) for p in parsed]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude response parse error: {exc}") from exc

    return PredictResponse(predictions=predictions, raw_response=raw)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
