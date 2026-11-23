import { Router } from 'express';
import { getDb } from '../db.ts';
import { hashPassword, requireAuth, requireRole, signToken, verifyPassword, type UserRole } from '../auth.ts';
import { nowSql } from '../utils.ts';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare('SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = ?')
    .get(username.trim()) as
    | {
        id: number;
        username: string;
        password_hash: string;
        full_name: string;
        role: UserRole;
        is_active: number;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    return;
  }

  if (user.is_active !== 1) {
    res.status(403).json({ error: 'تم تعطيل هذا الحساب، يرجى مراجعة المدير' });
    return;
  }

  const authUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  };
  const token = signToken(authUser);
  res.json({ token, user: authUser });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body ?? {};
  if (typeof old_password !== 'string' || typeof new_password !== 'string' || new_password.length < 4) {
    res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل' });
    return;
  }

  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined;

  if (!row || !verifyPassword(old_password, row.password_hash)) {
    res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), req.user!.id);
  res.json({ ok: true, message: 'تم تغيير كلمة المرور بنجاح' });
});

router.get('/users', requireAuth, requireRole('admin'), (_req, res) => {
  const db = getDb();
  const users = db
    .prepare('SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY id ASC')
    .all();
  res.json({ users });
});

router.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const { username, password, full_name, role } = req.body ?? {};
  if (
    typeof username !== 'string' ||
    !username.trim() ||
    typeof password !== 'string' ||
    password.length < 4 ||
    typeof full_name !== 'string' ||
    !full_name.trim() ||
    !['admin', 'cashier', 'warehouse'].includes(role)
  ) {
    res.status(400).json({ error: 'بيانات المستخدم غير مكتملة (كلمة المرور 4 أحرف على الأقل)' });
    return;
  }

  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username.trim());
  if (exists) {
    res.status(409).json({ error: 'اسم المستخدم مسجل بالفعل' });
    return;
  }

  const result = db
    .prepare(
      'INSERT INTO users(username, password_hash, full_name, role, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)'
    )
    .run(username.trim(), hashPassword(password), full_name.trim(), role, nowSql());

  const created = db
    .prepare('SELECT id, username, full_name, role, is_active, created_at FROM users WHERE id = ?')
    .get(Number(result.lastInsertRowid));
  res.status(201).json({ user: created });
});

router.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف المستخدم غير صالح' });
    return;
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?')
    .get(id) as { id: number; username: string; full_name: string; role: UserRole; is_active: number } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }

  const { full_name, role, is_active, password } = req.body ?? {};
  const nextName = typeof full_name === 'string' && full_name.trim() ? full_name.trim() : existing.full_name;
  const nextRole: UserRole = ['admin', 'cashier', 'warehouse'].includes(role) ? role : existing.role;
  const nextActive = typeof is_active === 'boolean' ? (is_active ? 1 : 0) : existing.is_active;

  if (existing.role === 'admin' && (nextRole !== 'admin' || nextActive === 0)) {
    const otherActiveAdmins = (
      db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?")
        .get(id) as { c: number }
    ).c;
    if (otherActiveAdmins === 0) {
      res.status(400).json({ error: 'لا يمكن تعطيل أو تغيير صلاحية آخر حساب مدير نشط' });
      return;
    }
  }

  db.prepare('UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?').run(
    nextName,
    nextRole,
    nextActive,
    id
  );

  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 4) {
      res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  }

  const updated = db
    .prepare('SELECT id, username, full_name, role, is_active, created_at FROM users WHERE id = ?')
    .get(id);
  res.json({ user: updated });
});

export default router;
