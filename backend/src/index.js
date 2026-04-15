import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from './db/database.js';

import cardsRouter from './routes/cards.js';
import statementsRouter from './routes/statements.js';
import transactionsRouter from './routes/transactions.js';
import manualEntriesRouter from './routes/manual-entries.js';
import dashboardRouter from './routes/dashboard.js';
import msiRouter from './routes/msi.js';
import profilesRouter from './routes/profiles.js';
import trendsRouter from './routes/trends.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize DB on startup
getDb();

app.use('/api/cards', cardsRouter);
app.use('/api/statements', statementsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/manual-entries', manualEntriesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/msi', msiRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/trends', trendsRouter);

// Serve uploaded PDFs
app.use('/uploads', express.static(join(__dirname, '../uploads')));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
