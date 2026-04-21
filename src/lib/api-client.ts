'use client';
// Wrappers fetch typés pour l'API /api/v1/*.
// Redirige vers /login sur 401. Lance ApiError sur autre erreur.

import type { LayoutPayload } from './schemas/layout';

export class ApiError extends Error {
  constructor(public status: number, public details?: unknown) {
    super(`API error ${status}`);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    // Session expirée : on n'est pas déjà sur /login ? → redirect.
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401);
  }

  if (!res.ok) {
    let details: unknown;
    try { details = await res.json(); } catch { details = await res.text().catch(() => null); }
    throw new ApiError(res.status, details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Types retour ─────────────────────────────────────────────────────────────

export type AuthUser = { id: string; email: string; displayName: string | null };

export type LayoutMeta = {
  id: string; ownerId: string; name: string; isPublic: number;
  createdAt: number; updatedAt: number;
  snapshotCount: number; latestSnapshotAt: number | null;
};

export type SharedLayoutMeta = LayoutMeta & {
  ownerEmail: string;
  ownerDisplayName: string | null;
};

export type LayoutsListResponse = {
  mine:   LayoutMeta[];
  shared: SharedLayoutMeta[];
};

export type SnapshotMeta = {
  id: string; layoutId: string; schemaVersion: number;
  sizeBytes: number; createdAt: number; createdBy: string; note: string | null;
};

export type SnapshotFull = SnapshotMeta & { payload: LayoutPayload };

export type LayoutWithLatest = {
  layout: {
    id: string; ownerId: string; name: string; isPublic: number;
    createdAt: number; updatedAt: number;
  };
  latestSnapshot: SnapshotFull;
};

export type UserSummary = {
  id: string; email: string; displayName: string | null;
  createdAt: number; lastLoginAt: number | null;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login:  (email: string, password: string) =>
    request<AuthUser>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () =>
    request<{ ok: true }>('/api/v1/auth/logout', { method: 'POST' }),
  me:     () => request<AuthUser>('/api/v1/auth/me'),
};

// ─── Layouts ──────────────────────────────────────────────────────────────────

export const layoutsApi = {
  list:   () => request<LayoutsListResponse>('/api/v1/layouts'),

  create: (name: string, payload: LayoutPayload, note?: string) =>
    request<{ layout: LayoutMeta; snapshotId: string }>('/api/v1/layouts', {
      method: 'POST', body: JSON.stringify({ name, payload, note }),
    }),

  get: (id: string) =>
    request<LayoutWithLatest>(`/api/v1/layouts/${encodeURIComponent(id)}`),

  rename: (id: string, name: string) =>
    request<LayoutMeta>(`/api/v1/layouts/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ name }),
    }),

  setPublic: (id: string, isPublic: boolean) =>
    request<LayoutMeta>(`/api/v1/layouts/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ isPublic }),
    }),

  remove: (id: string) =>
    request<{ ok: true }>(`/api/v1/layouts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  clone: (id: string) =>
    request<{ layout: LayoutMeta; snapshotId: string }>(
      `/api/v1/layouts/${encodeURIComponent(id)}/clone`,
      { method: 'POST' },
    ),

  listSnapshots: (id: string) =>
    request<SnapshotMeta[]>(`/api/v1/layouts/${encodeURIComponent(id)}/snapshots`),

  addSnapshot: (id: string, payload: LayoutPayload, note?: string) =>
    request<SnapshotMeta>(`/api/v1/layouts/${encodeURIComponent(id)}/snapshots`, {
      method: 'POST', body: JSON.stringify({ payload, note }),
    }),

  getSnapshot: (id: string, sid: string) =>
    request<SnapshotFull>(
      `/api/v1/layouts/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(sid)}`,
    ),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => request<UserSummary[]>('/api/v1/users'),
  create: (input: { email: string; password: string; displayName?: string | null }) =>
    request<UserSummary>('/api/v1/users', {
      method: 'POST', body: JSON.stringify(input),
    }),
};
