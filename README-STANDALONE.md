# Pharmacy Management System — Standalone Replica

This folder is a standalone/local version of the Pharmacy Management System source exported from the original Replit project.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Node.js + Express + TypeScript
- PostgreSQL + Drizzle ORM
- REST API
- TanStack Query
- Recharts
- Zod
- Wouter

## Local setup

### 1. Requirements
Install:
- Node.js 20+
- pnpm 10+
- PostgreSQL 15+

### 2. Database
Create a PostgreSQL database named `pharmacy_management`, then run:

```bash
psql -U postgres -d pharmacy_management -f database/schema.sql
```

Copy `.env.example` to `.env` and set `DATABASE_URL`.

### 3. Install dependencies

```bash
pnpm install
```

### 4. Start the API

```bash
pnpm dev:api
```

The API runs on `http://localhost:4000`.

### 5. Start the frontend (second terminal)

```bash
pnpm dev:frontend
```

Open `http://localhost:5173`.

The Vite development server proxies `/api` requests to the API server.

## Demo accounts

The backend seed creates demo users on an empty database:

- Admin: `admin@carepoint.test` / `admin123`
- Pharmacist: `pharmacist@carepoint.test` / `pharma123`
- Staff: `staff@carepoint.test` / `staff123`

## Notes

- Replit-only configuration, agent memory, preview sandbox, and Replit Vite plugins were removed.
- The application source, API routes, generated API client/Zod types, database model, UI, and seed data are preserved.
- Do not commit a real `.env` file or production database credentials.
