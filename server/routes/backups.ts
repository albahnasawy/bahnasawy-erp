import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { getBackupsDir } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';
import { createBackup, listBackups, restoreBackup } from '../backup.ts';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), (_req, res) => {
  res.json(listBackups());
});

router.post('/now', requireAuth, requireRole('admin'), (_req, res) => {
  try {
    const result = createBackup('manual');
    res.json({ backup: result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'فشل إنشاء النسخة الاحتياطية' });
  }
});

router.get('/download/:filename', requireAuth, requireRole('admin'), (req, res) => {
  const filename = String(req.params.filename || '');
  if (!filename || path.basename(filename) !== filename || !filename.endsWith('.db')) {
    res.status(400).json({ error: 'اسم ملف غير صالح' });
    return;
  }

  const fullPath = path.join(getBackupsDir(), filename);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'ملف النسخة الاحتياطية غير موجود' });
    return;
  }

  res.download(fullPath, filename);
});

router.post(
  '/restore',
  requireAuth,
  requireRole('admin'),
  express.raw({ type: ['application/octet-stream', 'application/x-sqlite3'], limit: '100mb' }),
  (req, res) => {
    try {
      let buf: Buffer | null = null;
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        buf = req.body;
      } else if (req.body && typeof req.body.data_base64 === 'string') {
        buf = Buffer.from(req.body.data_base64, 'base64');
      }

      if (!buf || buf.length < 100) {
        res.status(400).json({ error: 'لم يتم استلام ملف قاعدة بيانات صالح' });
        return;
      }

      const result = restoreBackup(buf);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'فشلت عملية الاستعادة' });
    }
  }
);

export default router;
