# Finance Tracker

Personal credit card manager for tracking Mexican bank statements via PDF upload. Supports multiple cards from BBVA, Banamex, and Santander.

## Features

- **PDF statement import** — Upload statements from BBVA, Banamex, and Santander (including password-protected PDFs)
- **Transaction classification** — Automatically detects regular charges, installment plans (MSI), payments, and interest
- **Installment Plans** — Track all active MSI plans across cards with progress bars and remaining amounts
- **Upcoming Payments** — Spreadsheet view showing every payment due month by month across all cards
- **Manual entries** — Add planned payments before the next statement arrives; auto-cleared when a new statement is uploaded
- **Balance projection** — Shows what you need to pay to avoid interest, adjusted by manual payments or real payments from the next statement
- **Dashboard** — Monthly overview grouped by payment due date (not statement period)
- **PDF storage** — Statements saved as `statements/{cardId}/{alias}-{YYYY}-{MM}.pdf` and downloadable from the card detail view

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite 5 + Vue 3 + Pinia + Vue Router + Tailwind CSS v4 |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| PDF parsing | pdf-parse (pdfjs) |
| File uploads | multer |

## Getting Started

### Requirements

- Node.js ≥ 20.18

### Install

```bash
npm install
```

### Run

Open two terminals:

```bash
# Terminal 1 — backend (port 3000)
npm run dev:backend

# Terminal 2 — frontend (port 5173)
npm run dev:frontend
```

Then open [http://localhost:5173](http://localhost:5173).

## Project Structure

```
finance-tracker/
├── backend/
│   └── src/
│       ├── index.js              # Express app
│       ├── db/
│       │   ├── schema.sql        # SQLite schema
│       │   └── database.js       # DB singleton + migrations
│       ├── routes/
│       │   ├── cards.js
│       │   ├── statements.js     # PDF upload + parse
│       │   ├── transactions.js
│       │   ├── manual-entries.js
│       │   ├── dashboard.js
│       │   └── msi.js
│       └── services/
│           ├── pdf-parser.js     # Bank detection + text extraction
│           └── parsers/
│               ├── bbva.js
│               ├── banamex.js
│               └── santander.js
└── frontend/
    └── src/
        ├── views/
        │   ├── DashboardView.vue
        │   ├── CardDetailView.vue
        │   ├── MSIPlansView.vue
        │   ├── MSIView.vue       # Upcoming Payments
        │   ├── UploadView.vue
        │   └── SettingsView.vue
        └── components/
            ├── CardSummaryWidget.vue
            ├── TransactionList.vue
            ├── MSITracker.vue
            ├── ManualEntryModal.vue
            ├── AddCardModal.vue
            ├── EditCardModal.vue
            └── AppLogo.vue
```

## Supported Banks

| Bank | Parser |
|------|--------|
| BBVA | `parsers/bbva.js` |
| Banamex (Citibanamex) | `parsers/banamex.js` |
| Santander | `parsers/santander.js` |

Bank is auto-detected from the first 1000 characters of extracted PDF text.

## Data & Privacy

All data is stored locally:
- Database: `backend/data/finance.db`
- PDFs: `backend/uploads/statements/{cardId}/`

Both are excluded from git via `.gitignore`.
