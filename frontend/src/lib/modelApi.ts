const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

// ─── Input Schema ─────────────────────────────────────────────────────────────
export interface ZoneInput {
  zone_id: string;
  zone_type: string;
  timestamp: string;       // ISO-8601
  hour_of_day: number;     // 0-23
  day_of_week: number;     // 0 = Monday, 6 = Sunday
  is_weekend: boolean;
  month: number;           // 1-12
  day_of_year: number;     // 1-365
  demand_mw: number;
  temperature_c: number;
  cloud_cover_pct: number; // 0-100
  solar_irradiance_wm2: number;
  wind_speed_ms: number;
  humidity_pct: number;    // 0-100
  population: number;
  demand_lag_1h: number;
  demand_lag_6h: number;
  demand_lag_24h: number;
  demand_rolling_6h_avg: number;
  demand_rolling_24h_avg: number;
}

// ─── Output Schema ────────────────────────────────────────────────────────────
export interface ZonePrediction {
  zone_id?: string;
  predicted_demand_mw?: number;
  confidence_lower?: number;
  confidence_upper?: number;
  risk_score?: number;
  recommended_action?: string;
  /** Derived when API returns hourly (or multi-step) `output_df` per zone */
  forecast_peak_mw?: number;
  forecast_trough_mw?: number;
  forecast_horizon_steps?: number;
  [key: string]: unknown;
}

export interface ModelResult {
  predictions: ZonePrediction[];
  rawResponse: unknown;
}

/** Post-run heuristic: grid under heavy load from per-zone risk scores (0–1). */
export function isHeavyGridLoad(result: ModelResult): boolean {
  const preds = result.predictions;
  if (!preds?.length) return false;
  let maxR = 0;
  let sum = 0;
  let n = 0;
  for (const p of preds) {
    const r = p.risk_score;
    if (typeof r === 'number' && !Number.isNaN(r)) {
      maxR = Math.max(maxR, r);
      sum += r;
      n++;
    }
  }
  if (n === 0) return false;
  if (maxR > 0.52) return true;
  if (sum / n > 0.38) return true;
  return false;
}

/**
 * Heuristic: forecasts disagree materially (risk spread / volatility) — “unstable” Live AI read.
 * Used with `isHeavyGridLoad` for a darker stress visual (e.g. waves).
 */
export function isUnstablePredictionSet(result: ModelResult): boolean {
  const preds = result.predictions;
  if (!preds?.length || preds.length < 2) return false;
  const risks: number[] = [];
  for (const p of preds) {
    const r = p.risk_score;
    if (typeof r === 'number' && !Number.isNaN(r)) risks.push(r);
  }
  if (risks.length < 2) return false;
  const minR = Math.min(...risks);
  const maxR = Math.max(...risks);
  if (maxR - minR > 0.2) return true;
  const mean = risks.reduce((a, b) => a + b, 0) / risks.length;
  if (mean < 1e-6) return false;
  const variance = risks.reduce((a, b) => a + (b - mean) ** 2, 0) / risks.length;
  const cv = Math.sqrt(variance) / mean;
  return cv > 0.35;
}

// ─── Build contextual input for the current moment ───────────────────────────
export function buildTimeContext() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);

  return {
    timestamp: now.toISOString(),
    hour_of_day: now.getHours(),
    day_of_week: now.getDay() === 0 ? 6 : now.getDay() - 1, // Mon=0
    is_weekend: now.getDay() === 0 || now.getDay() === 6,
    month: now.getMonth() + 1,
    day_of_year: dayOfYear,
  };
}

/** Sample interval for zone demand history (must match FluxDashboard tick cadence). */
export const LAG_SAMPLE_INTERVAL_SEC = 2;

/** Max samples kept per zone (~1h at 2s). */
export const ZONE_DEMAND_HISTORY_CAP = Math.floor(3600 / LAG_SAMPLE_INTERVAL_SEC);

/** Samples covering ~1h at 2s cadence (1800). */
function samplesForHours(hours: number): number {
  return Math.floor((hours * 3600) / LAG_SAMPLE_INTERVAL_SEC);
}

/**
 * Lag / rolling features from **this zone’s** demand history (MW), not aggregate grid.
 * Indices are derived from 2s sampling so “1h ago” uses the correct offset.
 */
export function buildDemandLags(currentDemand: number, zoneDemandHistory?: number[]) {
  const hist = zoneDemandHistory ?? [];
  const n = hist.length;
  const s1h = samplesForHours(1);
  const s6h = samplesForHours(6);

  // ~1h ago at 2s cadence; shorter buffer → use ~1 min lookback (30 samples) so stress shows vs recent past.
  let lag1: number;
  if (n >= s1h) {
    lag1 = hist[n - s1h]!;
  } else if (n > 0) {
    const idx = Math.max(0, n - 30);
    lag1 = hist[idx]!;
  } else {
    lag1 = currentDemand * 0.98;
  }

  // ~6h ago: rarely have full buffer; blend oldest available toward current.
  let lag6: number;
  if (n >= s6h) {
    lag6 = hist[n - s6h]!;
  } else if (n > 0) {
    const oldest = hist[0]!;
    lag6 = Math.round(oldest * 0.55 + currentDemand * 0.45);
  } else {
    lag6 = currentDemand * 0.92;
  }

  // 24h lag: soft prior when we don’t have a day of data
  const lag24 =
    n > 0
      ? Math.round(hist[0]! * 0.35 + currentDemand * 0.65)
      : Math.round(currentDemand * 0.88);

  const roll6Slice = n >= s1h ? hist.slice(-s1h) : hist;
  const roll6 =
    roll6Slice.length > 0
      ? roll6Slice.reduce((a, b) => a + b, 0) / roll6Slice.length
      : currentDemand * 0.93;

  const roll24 =
    n > 0 ? hist.reduce((a, b) => a + b, 0) / n : currentDemand * 0.9;

  return {
    demand_lag_1h: Math.round(lag1),
    demand_lag_6h: Math.round(lag6),
    demand_lag_24h: lag24,
    demand_rolling_6h_avg: Math.round(roll6),
    demand_rolling_24h_avg: Math.round(roll24),
  };
}


// ─── Main API call (Claude via backend) ───────────────────────────────────────
export async function runZonePrediction(zones: ZoneInput[]): Promise<ModelResult> {
  const res = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zones }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  const data = await res.json() as { predictions: ZonePrediction[]; raw_response: string };
  return { predictions: data.predictions, rawResponse: data.raw_response };
}

/** Resolve prediction for a zone (match zone_id when present). */
export function predictionForZone(predictions: ZonePrediction[], zoneId: string, index: number): ZonePrediction {
  const byId = predictions.find(p => p.zone_id === zoneId);
  if (byId) return byId;
  return predictions[index] ?? {};
}

/** Safe display for extra prediction fields (avoid [object Object]). */
export function formatPredictionExtra(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
