# After Life

A platform for preserving memories and conversing with AI personas of loved ones.

## Quick Start

### Frontend

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:8080`.

### Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

### Environment

Create a `.env` file in the project root and set:

- `ANTHROPIC_API_KEY` — required for Claude-backed chat streaming
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` — required for media uploads

## Project Structure

```
├── src/                  # React + TypeScript frontend (Vite)
│   ├── components/       # Reusable UI components (shadcn/ui + custom)
│   ├── pages/            # Route-level page components
│   ├── hooks/            # Custom React hooks
│   └── lib/              # Shared utilities and API client helpers
├── backend/              # Python FastAPI backend
│   ├── app/              # FastAPI application package
│   │   ├── api/          # HTTP route handlers
│   │   ├── models/       # Pydantic request/response schemas
│   │   └── services/     # Business logic (Claude streaming, Supabase, safety)
│   └── tests/            # Pytest unit and integration tests
├── public/               # Static assets served by Vite
└── docs/                 # Architecture and design documentation
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Python 3.11+, FastAPI, Anthropic Claude API, Supabase
- **Testing**: Vitest (frontend), Pytest (backend)
