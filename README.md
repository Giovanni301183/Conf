# Preventivatore Tracker

Web app per preventivi del tracker 1303. Specifiche in [PRD.md](PRD.md).

**Stack:** React + Vite (TypeScript) · Supabase (Auth + Postgres) · deploy su Vercel.

## Comandi

```bash
npm install      # dipendenze
npm run dev      # app in locale su http://localhost:5173
npm test         # validazione dei totali sull'Excel + prova di tutte le schede
npm run build    # build di produzione in dist/
```

## Struttura

- `src/domain/` — logica di calcolo (listino, distinte, costi, margini, distinta di lavorazione, Gantt, export Excel/CSV), portata dall'app HTML.
- `src/store/` — stato dell'app, salvataggio nel browser, archivio preventivi.
- `src/pages/` — una pagina per scheda; `src/components/` — campi, tendine, Gantt.

I dati per ora restano nel browser (stesse chiavi dell'app HTML); il passaggio a Supabase è il prossimo passo.

## Configurazione locale

1. Copia `.env.example` in `.env.local`.
2. Inserisci URL e chiavi del progetto Supabase.
3. `.env.local` è escluso da git: le chiavi non vanno mai su GitHub.

## Versione precedente

L'app a file singolo è in `legacy/index.html` e nel tag git `legacy-html`.
