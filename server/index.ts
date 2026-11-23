import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';
import { getDb } from './db.ts';
import { seedDatabase } from './seed.ts';
import { runAutoBackupIfNeeded } from './backup.ts';
import authRouter from './routes/auth.ts';
import settingsRouter from './routes/settings.ts';
import productsRouter from './routes/products.ts';
import warehousesRouter from './routes/warehouses.ts';
import { customersRouter, plumbersRouter, suppliersRouter } from './routes/parties.ts';
import salesRouter from './routes/sales.ts';
import purchasesRouter from './routes/purchases.ts';
import treasuryRouter from './routes/treasury.ts';
import reportsRouter from './routes/reports.ts';
import backupsRouter from './routes/backups.ts';

export function createApp() {
  getDb();
  seedDatabase();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'bahnasawy-erp' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/warehouses', warehousesRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/plumbers', plumbersRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/purchases', purchasesRouter);
  app.use('/api/treasury', treasuryRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/backups', backupsRouter);

  const distDir = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const port = Number(process.env.PORT || 4850);
  const app = createApp();

  runAutoBackupIfNeeded();
  const backupTimer = setInterval(() => {
    runAutoBackupIfNeeded();
  }, 60 * 60 * 1000);
  backupTimer.unref();

  app.listen(port, '127.0.0.1', () => {
    console.log(`Al-Bahnasawy ERP running at http://127.0.0.1:${port}`);
  });
}
