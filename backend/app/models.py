from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class SimulateInput(BaseModel):
    temperature: float = Field(default=72.0, ge=50, le=110, description="Fahrenheit")
    solar_factor: float = Field(default=1.0, ge=0.0, le=2.0)
    ev_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)
    data_center_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)


class CityMetrics(BaseModel):
    name: str
    lat: float
    lon: float
    demand_mw: float
    renewable_mw: float
    storage_level_pct: float
    storage_capacity_mw: float
    risk_score: float
    risk_level: Literal["low", "medium", "high", "critical"]
    available_support_mw: float


class ForecastPoint(BaseModel):
    hour_offset: int
    predicted_demand_mw: float


class CityForecast(BaseModel):
    city: str
    points: list[ForecastPoint]


class EnergyFlow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    from_city: str = Field(alias="from")
    to_city: str = Field(alias="to")
    mw: float


class EnergyFlowResponse(BaseModel):
    flows: list[EnergyFlow]


class Recommendation(BaseModel):
    priority: Literal["info", "warning", "critical"]
    title: str
    detail: str


class AIQuery(BaseModel):
    query: str


class AIResponse(BaseModel):
    answer: str
    structured: dict


# ── Claude-powered zone prediction ──────────────────────────────────────────

class ZoneInput(BaseModel):
    zone_id: str
    zone_type: str
    timestamp: str
    hour_of_day: int
    day_of_week: int
    is_weekend: bool
    month: int
    day_of_year: int
    demand_mw: float
    temperature_c: float
    cloud_cover_pct: float
    solar_irradiance_wm2: float
    wind_speed_ms: float
    humidity_pct: float
    population: int
    demand_lag_1h: float
    demand_lag_6h: float
    demand_lag_24h: float
    demand_rolling_6h_avg: float
    demand_rolling_24h_avg: float


class ZonePrediction(BaseModel):
    zone_id: str
    predicted_demand_mw: Optional[float] = None
    confidence_lower: Optional[float] = None
    confidence_upper: Optional[float] = None
    risk_score: Optional[float] = None
    forecast_peak_mw: Optional[float] = None
    forecast_trough_mw: Optional[float] = None


class PredictRequest(BaseModel):
    zones: list[ZoneInput]


class PredictResponse(BaseModel):
    predictions: list[ZonePrediction]
    raw_response: str
