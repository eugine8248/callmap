// Settings persistence. Uses localStorage in dev/web, falls back gracefully
// if Tauri secure-store APIs are unavailable. For v0.1 this is fine —
// see README roadmap for moving the PAT to OS keychain in v0.2.

import type { RecentPr } from "../types";

const PAT_KEY = "callmap.gh_pat";
const RECENT_KEY = "callmap.recent_prs";
const MAX_RECENT = 10;

export function getToken(): string | null {
  try {
    return localStorage.getItem(PAT_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    if (token.trim().length === 0) localStorage.removeItem(PAT_KEY);
    else localStorage.setItem(PAT_KEY, token.trim());
  } catch {
    /* noop */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(PAT_KEY);
  } catch {
    /* noop */
  }
}

export function getRecentPrs(): RecentPr[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPr[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentPr(entry: RecentPr): void {
  const existing = getRecentPrs().filter((e) => e.url !== entry.url);
  const next = [entry, ...existing].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function clearRecentPrs(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* noop */
  }
}
