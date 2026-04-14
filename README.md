# Flux

AI-powered **smart energy grid simulation** for the ten largest US cities — demand forecasting, renewable supply, storage, risk scoring, and animated inter-city power flows. Built with a FastAPI backend powered by **Groq AI** and a React + Vite frontend.

## Live Demo

> **[flux-dmikmut.vercel.app](https://flux-dmikmut.vercel.app)**

---

## What to Demo

1. Pick a **city** and adjust the scenario sliders (temperature, solar, EV load, data centers)
2. Watch **risk-colored zones** and **animated flow lines** update in real time
3. Hit **Run Groq AI Prediction** to get live AI-generated demand forecasts per zone
4. Explore the **Analytics** and **Forecasting** pages for charts and grid insights

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript |
| Backend | FastAPI (Python) |
| AI Model | Groq API — `llama-3.3-70b-versatile` |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Run Locally

### 1. Backend

```bash
cd backend
pip3 install -r requirements.txt
```

Create `backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key_here
```

Start the server:
```bash
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — the dev server proxies API calls to the backend on port 8000.

---

## Deploy Your Own

### Backend → Render
1. New Web Service → connect this repo
2. Root Directory: `backend`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variable: `GROQ_API_KEY`

### Frontend → Vercel
1. New Project → import this repo
2. Leave Root Directory blank (the `vercel.json` handles it)
3. Add environment variable: `VITE_API_BASE=https://your-render-url.onrender.com`

---

## Cities

New York City, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose

---

## Notes

- All simulation numbers are synthetic — tuned for visual clarity
- Groq API key is required for AI predictions (free tier available at [console.groq.com](https://console.groq.com))
