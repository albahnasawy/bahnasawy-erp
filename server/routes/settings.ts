import { Router } from 'express';
import { getDb, setSetting } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';

const router = Router();

const ALLOWED_KEYS = [
  'store_name',
  'owner_name',
  'store_phone',
  'store_address',
  'vat_enabled',
  'default_vat_rate',
  'default_print_size',
  'auto_backup_enabled',
  'secondary_backup_path',
  'backup_retention_days',
  'invoice_footer_note',
];

const ADMIN_ONLY_KEYS = new Set([
  'secondary_backup_path',
  'last_backup_file',
  'backup_retention_days',
]);

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) {
    if (r.key === 'auth_secret') continue;
    if (req.user!.role !== 'admin' && ADMIN_ONLY_KEYS.has(r.key)) continue;
    settings[r.key] = r.value;
  }
  res.json({ settings });
});

router.put('/', requireAuth, requireRole('admin'), (req, res) => {
  const body = req.body ?? {};
  const db = getDb();

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined && body[key] !== null) {
      let val = String(body[key]);
      if (key === 'default_vat_rate') {
        const rate = Number(val);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          res.status(400).json({ error: 'نسبة ضريبة القيمة المضافة غير صالحة' });
          return;
        }
        val = String(rate);
      }
      if (key === 'backup_retention_days') {
        const days = Math.max(1, Math.round(Number(val) || 30));
        val = String(days);
      }
      if (key === 'vat_enabled' || key === 'auto_backup_enabled') {
        val = val === 'true' || val === '1' ? 'true' : 'false';
      }
      setSetting(db, key, val);
    }
  }

  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) {
    if (r.key === 'auth_secret') continue;
    settings[r.key] = r.value;
  }
  res.json({ settings });
});

export default router;
