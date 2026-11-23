import { handleDemoRequest, isDemoMode } from './lib/demoBackend';

const TOKEN_KEY = 'bahnasawy_erp_token';

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorizedCallback: (() => void) | null = null;
export function setOnUnauthorized(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

export async function apiRequest<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  if (isDemoMode) {
    try {
      return await handleDemoRequest<T>(url, options, token);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401 && onUnauthorizedCallback && !url.includes('/api/auth/login')) {
        onUnauthorizedCallback();
      }
      throw err;
    }
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!(options.body instanceof ArrayBuffer) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }

  if (res.status === 401) {
    if (onUnauthorizedCallback && !url.includes('/api/auth/login')) {
      onUnauthorizedCallback();
    }
    throw new Error(String(data.error || 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً'));
  }

  if (!res.ok) {
    throw new Error(String(data.error || `خطأ غير متوقع (${res.status})`));
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(url: string) => apiRequest<T>(url, { method: 'GET' }),
  post: <T = unknown>(url: string, body?: unknown) =>
    apiRequest<T>(url, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(url: string, body?: unknown) =>
    apiRequest<T>(url, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T = unknown>(url: string) => apiRequest<T>(url, { method: 'DELETE' }),
};
