import fs from 'node:fs';
import path from 'node:path';
import {
  closeDb,
  getBackupsDir,
  getDb,
  getDbPath,
  getSetting,
  reopenDb,
  setSetting,
} from './db.ts';
import { nowSql, todayStr } from './utils.ts';

export type BackupReason = 'auto' | 'manual' | 'pre-restore';

export interface BackupResult {
  filename: string;
  filePath: string;
  size: number;
  created_at: string;
  secondaryCopied: boolean;
  secondaryError: string | null;
}

export interface BackupFileInfo {
  filename: string;
  size: number;
  created_at: string;
}

function pruneOldBackups(backupsDir: string, retentionDays: number): void {
  try {
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith('.db') && f.startsWith('bahnasawy_'))
      .map((f) => {
        const full = path.join(backupsDir, f);
        const st = fs.statSync(full);
        return { name: f, full, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (files.length <= 5) return;
    const cutoff = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
    for (let i = 5; i < files.length; i++) {
      if (files[i].mtimeMs < cutoff) {
        fs.unlinkSync(files[i].full);
      }
    }
  } catch {
    // ignore pruning errors
  }
}

export function createBackup(reason: BackupReason = 'manual'): BackupResult {
  const db = getDb();
  const backupsDir = getBackupsDir();
  fs.mkdirSync(backupsDir, { recursive: true });

  const ts = nowSql().replace(' ', '_').replace(/:/g, '-');
  let filename = `bahnasawy_${ts}_${reason}.db`;
  let targetPath = path.join(backupsDir, filename);
  let counter = 1;
  while (fs.existsSync(targetPath)) {
    filename = `bahnasawy_${ts}_${reason}_${counter}.db`;
    targetPath = path.join(backupsDir, filename);
    counter += 1;
  }

  const escapedPath = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);

  const stat = fs.statSync(targetPath);
  const createdAt = nowSql();

  if (reason !== 'pre-restore') {
    setSetting(db, 'last_backup_at', createdAt);
    setSetting(db, 'last_backup_file', filename);
  }

  const secondaryDir = getSetting(db, 'secondary_backup_path', '').trim();
  let secondaryCopied = false;
  let secondaryError: string | null = null;
  if (secondaryDir) {
    try {
      fs.mkdirSync(secondaryDir, { recursive: true });
      fs.copyFileSync(targetPath, path.join(secondaryDir, filename));
      secondaryCopied = true;
    } catch (err) {
      secondaryError = err instanceof Error ? err.message : 'تعذر النسخ إلى المسار الثانوي (الفلاشة)';
    }
  }

  const retentionDays = Number(getSetting(db, 'backup_retention_days', '30')) || 30;
  pruneOldBackups(backupsDir, retentionDays);

  return {
    filename,
    filePath: targetPath,
    size: stat.size,
    created_at: createdAt,
    secondaryCopied,
    secondaryError,
  };
}

export function listBackups(): {
  files: BackupFileInfo[];
  backups_dir: string;
  last_backup_at: string;
  secondary_backup_path: string;
  auto_backup_enabled: boolean;
  backup_retention_days: number;
} {
  const db = getDb();
  const backupsDir = getBackupsDir();
  fs.mkdirSync(backupsDir, { recursive: true });

  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const full = path.join(backupsDir, f);
      const st = fs.statSync(full);
      return {
        filename: f,
        size: st.size,
        created_at: nowSql(st.mtime),
        mtimeMs: st.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ filename, size, created_at }) => ({ filename, size, created_at }));

  return {
    files,
    backups_dir: backupsDir,
    last_backup_at: getSetting(db, 'last_backup_at', ''),
    secondary_backup_path: getSetting(db, 'secondary_backup_path', ''),
    auto_backup_enabled: getSetting(db, 'auto_backup_enabled', 'true') === 'true',
    backup_retention_days: Number(getSetting(db, 'backup_retention_days', '30')) || 30,
  };
}

export function runAutoBackupIfNeeded(): void {
  try {
    const db = getDb();
    const enabled = getSetting(db, 'auto_backup_enabled', 'true') === 'true';
    if (!enabled) return;

    const today = todayStr();
    const lastBackupAt = getSetting(db, 'last_backup_at', '');
    if (lastBackupAt.startsWith(today)) return;

    const backupsDir = getBackupsDir();
    if (fs.existsSync(backupsDir)) {
      const hasTodayFile = fs
        .readdirSync(backupsDir)
        .some((f) => f.startsWith(`bahnasawy_${today}_`) && f.endsWith('.db') && !f.includes('pre-restore'));
      if (hasTodayFile) return;
    }

    createBackup('auto');
  } catch (err) {
    console.error('Auto backup warning:', err);
  }
}

export function restoreBackup(fileBuffer: Buffer): { preRestoreFilename: string; restoredBytes: number } {
  const header = fileBuffer.subarray(0, 16).toString('utf8');
  if (header !== 'SQLite format 3\0') {
    throw new Error('ملف النسخة الاحتياطية غير صالح (ليس ملف SQLite سليم)');
  }

  const preBackup = createBackup('pre-restore');
  const dbPath = getDbPath();
  closeDb();

  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = `${dbPath}${suffix}`;
      if (suffix && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
    fs.writeFileSync(dbPath, fileBuffer);
    reopenDb();
    return {
      preRestoreFilename: preBackup.filename,
      restoredBytes: fileBuffer.length,
    };
  } catch (err) {
    reopenDb();
    throw err;
  }
}
