/* ═══════════════════════════════════════════════════════════════
   Auth Security Module
   - SHA-256 password hashing (salted, 2 rounds)
   - Login attempt locking (5 fails → 15min lock)
   - Canvas captcha
   - Session management (24h expiry)
   - First-login force password change
   - Admin invite code system
   ═══════════════════════════════════════════════════════════════ */

const AUTH_KEY = 'auth_session';
const LOCK_KEY = 'auth_lock';
const INVITE_KEY = 'auth_invite_codes';
const USERS_KEY = 'auth_users';

/* ─── SHA-256 Hash ─── */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}


function sha256Sync(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ─── Session ─── */
export interface AuthSession {
  token: string;
  username: string;
  isAdmin: boolean;
  createdAt: number;
  expiresAt: number;
  forceChangePassword?: boolean;
}

export interface StoredUser {
  username: string;
  passwordHash: string;
  salt: string;
  isAdmin: boolean;
  createdAt: string;
  forceChangePassword: boolean;
}

export interface InviteCode {
  code: string;
  createdBy: string;
  createdAt: string;
  used: boolean;
  usedBy?: string;
}

function getSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return session;
  } catch { return null; }
}

export function isLoggedIn(): boolean {
  return getSession() !== null;
}

export function isAdmin(): boolean {
  const s = getSession();
  return s?.isAdmin ?? false;
}

export function getCurrentUser(): string | null {
  return getSession()?.username ?? null;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}

/* ─── Login Attempt Locking ─── */
interface LockRecord {
  fails: number;
  lockedUntil: number | null;
}

function getLock(username: string): LockRecord {
  try {
    const all = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') as Record<string, LockRecord>;
    return all[username] || { fails: 0, lockedUntil: null };
  } catch { return { fails: 0, lockedUntil: null }; }
}

function setLock(username: string, record: LockRecord): void {
  const all = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') as Record<string, LockRecord>;
  all[username] = record;
  localStorage.setItem(LOCK_KEY, JSON.stringify(all));
}

function isLocked(username: string): { locked: boolean; remainingMs: number } {
  const lock = getLock(username);
  if (lock.lockedUntil && Date.now() < lock.lockedUntil) {
    return { locked: true, remainingMs: lock.lockedUntil - Date.now() };
  }
  return { locked: false, remainingMs: 0 };
}

function recordFail(username: string): void {
  const lock = getLock(username);
  lock.fails += 1;
  if (lock.fails >= 5) {
    lock.lockedUntil = Date.now() + 15 * 60 * 1000;
  }
  setLock(username, lock);
}

function clearLock(username: string): void {
  const all = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') as Record<string, LockRecord>;
  delete all[username];
  localStorage.setItem(LOCK_KEY, JSON.stringify(all));
}

/* ─── User Storage ─── */
function getUsers(): Record<string, StoredUser> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  } catch { return {}; }
}

function saveUser(user: StoredUser): void {
  const users = getUsers();
  users[user.username] = user;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/* ─── Admin Setup ─── */
export function ensureAdminExists(): void {
  const users = getUsers();
  if (!users['admin']) {
    const salt = 'fixed_salt_admin_2024';
    const hash = sha256Sync('A83967251a' + salt) + salt;
    saveUser({
      username: 'admin',
      passwordHash: hash,
      salt,
      isAdmin: true,
      createdAt: new Date().toISOString(),
      forceChangePassword: false,
    });
  }
}

/* ─── Login ─── */
export async function login(username: string, password: string): Promise<{ success: boolean; error?: string; forceChange?: boolean }> {
  const lock = isLocked(username);
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    return { success: false, error: `账户已锁定，请${mins}分钟后再试` };
  }

  const users = getUsers();
  const user = users[username];
  if (!user) {
    recordFail(username);
    return { success: false, error: '用户名或密码错误' };
  }

  const inputHash = sha256Sync(password + user.salt) + user.salt;
  if (inputHash !== user.passwordHash) {
    recordFail(username);
    const lock2 = getLock(username);
    const remaining = 5 - lock2.fails;
    return { success: false, error: `用户名或密码错误，还剩${remaining}次机会` };
  }

  clearLock(username);

  const token = await sha256(username + Date.now().toString());
  const session: AuthSession = {
    token,
    username,
    isAdmin: user.isAdmin,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    forceChangePassword: user.forceChangePassword,
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify({ name: username, email: '' }));
  if (user.isAdmin) localStorage.setItem('auth_admin', 'true');

  return { success: true, forceChange: user.forceChangePassword };
}

/* ─── Register ─── */
export async function register(username: string, password: string, inviteCode: string): Promise<{ success: boolean; error?: string }> {
  const users = getUsers();
  if (users[username]) {
    return { success: false, error: '用户名已存在' };
  }

  if (!verifyInviteCode(inviteCode)) {
    return { success: false, error: '邀请码无效或已被使用' };
  }

  const salt = generateSalt();
  const hash = sha256Sync(password + salt) + salt;
  saveUser({
    username,
    passwordHash: hash,
    salt,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    forceChangePassword: false,
  });

  markInviteCodeUsed(inviteCode, username);
  return { success: true };
}

/* ─── Change Password ─── */
export async function changePassword(username: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const users = getUsers();
  const user = users[username];
  if (!user) return { success: false, error: '用户不存在' };

  const oldHash = sha256Sync(oldPassword + user.salt) + user.salt;
  if (oldHash !== user.passwordHash) {
    return { success: false, error: '原密码错误' };
  }

  const newSalt = generateSalt();
  const newHash = sha256Sync(newPassword + newSalt) + newSalt;
  user.passwordHash = newHash;
  user.salt = newSalt;
  user.forceChangePassword = false;
  saveUser(user);

  const session = getSession();
  if (session && session.username === username) {
    session.forceChangePassword = false;
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  }

  return { success: true };
}

/* ─── Captcha ─── */
export function generateCaptcha(): { text: string; image: string } {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let text = '';
  for (let i = 0; i < 4; i++) text += chars[Math.floor(Math.random() * chars.length)];

  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 36;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1a1b20';
  ctx.fillRect(0, 0, 100, 36);

  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(206,209,213,${0.1 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 100, Math.random() * 36);
    ctx.lineTo(Math.random() * 100, Math.random() * 36);
    ctx.stroke();
  }

  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(206,209,213,${0.7 + Math.random() * 0.3})`;
    ctx.font = `bold ${16 + Math.floor(Math.random() * 6)}px monospace`;
    ctx.save();
    ctx.translate(15 + i * 20, 24 + (Math.random() - 0.5) * 6);
    ctx.rotate((Math.random() - 0.5) * 0.6);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }

  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(206,209,213,${0.2 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * 100, Math.random() * 36, 1, 1);
  }

  return { text, image: canvas.toDataURL() };
}

export function verifyCaptcha(input: string, expected: string): boolean {
  return input.toUpperCase() === expected.toUpperCase();
}

/* ─── Invite Code System ─── */
export function generateInviteCode(adminUsername: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];

  const codes = getInviteCodes();
  codes.push({ code, createdBy: adminUsername, createdAt: new Date().toISOString(), used: false });
  localStorage.setItem(INVITE_KEY, JSON.stringify(codes));
  return code;
}

export function getInviteCodes(): InviteCode[] {
  try {
    return JSON.parse(localStorage.getItem(INVITE_KEY) || '[]');
  } catch { return []; }
}

function verifyInviteCode(code: string): boolean {
  const codes = getInviteCodes();
  const found = codes.find((c) => c.code === code && !c.used);
  return !!found;
}

function markInviteCodeUsed(code: string, usedBy: string): void {
  const codes = getInviteCodes();
  const found = codes.find((c) => c.code === code);
  if (found) {
    found.used = true;
    found.usedBy = usedBy;
    localStorage.setItem(INVITE_KEY, JSON.stringify(codes));
  }
}

export function getAllUsers(): StoredUser[] {
  return Object.values(getUsers());
}

export function deleteUser(username: string): void {
  const users = getUsers();
  delete users[username];
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/* ─── Init ─── */
ensureAdminExists();
