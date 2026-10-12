# Preventivatore Tracker

Web app per preventivi del tracker 1303. Specifiche in [PRD.md](PRD.md).

**Stack:** React + Vite (TypeScript) · Supabase (Auth + Postgres) · deploy su Vercel.

## Configurazione locale

1. Copia `.env.example` in `.env.local`.
2. Inserisci URL e chiavi del progetto Supabase.
3. `.env.local` è escluso da git: le chiavi non vanno mai su GitHub.

## Versione precedente

L'app a file singolo (`index.html`) è conservata nella storia git, nel primo commit:

```bash
git show legacy-html:index.html > index-legacy.html
```
