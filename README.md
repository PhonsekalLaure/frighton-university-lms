# Frighton University LMS (Library Management System)

A modern Library Management System built for Frighton University with **React (TypeScript)**, **Node.js + Express (TypeScript)**, and **Supabase (PostgreSQL & Auth)**. 

Integrates with **Frighton University SIS** for student self-service, borrowing eligibility, and library-debt holds. Deploy the reviewed migrations, configure distinct directional credentials, and start the maintenance worker before enabling self-service. See [integration operations](docs/library-self-service-operations.md).

---

## 🏗️ Structure & Ports

- **Client Portal**: `http://localhost:3001` (React 19 + Vite)
- **Backend API**: `http://localhost:5001` (Express + TypeScript)
- **Partner SIS API**: `http://localhost:5000`

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start both client and server concurrently
npm run dev
```
