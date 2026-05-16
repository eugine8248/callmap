// Minimal GitHub REST client for the v0.1 pipeline:
//   - parse PR URL
//   - fetch PR metadata (base/head SHAs)
//   - fetch list of changed files
//   - fetch raw file content at a given SHA
//
// Rate limit awareness: we surface X-RateLimit-Remaining/Limit
// via the `rateLimit` field on every response.

import type { ChangedFile, PullRequestMeta } from "../types";
import { getToken } from "./settings";

const GH_API = "https://api.github.com";

export interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: number; // unix seconds
}

export interface PrUrlParts {
  owner: string;
  repo: string;
  number: number;
}

let lastRateLimit: RateLimit | null = null;

export function getLastRateLimit(): RateLimit | null {
  return lastRateLimit;
}

export function parsePrUrl(input: string): PrUrlParts | null {
  const trimmed = input.trim();
  // Accept: https://github.com/<owner>/<repo>/pull/<number>  (with optional /files or trailing slash)
  const m = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:\b|\/)/i
  );
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2],
    number: parseInt(m[3], 10),
  };
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function captureRateLimit(res: Response): void {
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const limit = res.headers.get("X-RateLimit-Limit");
  const reset = res.headers.get("X-RateLimit-Reset");
  if (remaining !== null && limit !== null && reset !== null) {
    lastRateLimit = {
      remaining: parseInt(remaining, 10),
      limit: parseInt(limit, 10),
      resetAt: parseInt(reset, 10),
    };
  }
}

export class GithubError extends Error {
  status: number;
  isRateLimit: boolean;
  constructor(message: string, status: number, isRateLimit = false) {
    super(message);
    this.status = status;
    this.isRateLimit = isRateLimit;
  }
}

async function ghFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
  });
  captureRateLimit(res);
  if (!res.ok) {
    const rl = res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0";
    const body = await res.text().catch(() => "");
    throw new GithubError(
      `GitHub API ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      rl
    );
  }
  return (await res.json()) as T;
}

export async function fetchPrMeta(parts: PrUrlParts): Promise<PullRequestMeta> {
  const url = `${GH_API}/repos/${parts.owner}/${parts.repo}/pulls/${parts.number}`;
  const data = await ghFetch<any>(url);
  return {
    owner: parts.owner,
    repo: parts.repo,
    number: parts.number,
    title: data.title,
    baseSha: data.base.sha,
    headSha: data.head.sha,
    url: data.html_url,
  };
}

export async function fetchChangedFiles(parts: PrUrlParts): Promise<ChangedFile[]> {
  // GitHub paginates; for v0.1 we cap at the first page (30 files), which
  // covers ~95% of review-sized PRs. v0.2 backlog: full pagination.
  const url = `${GH_API}/repos/${parts.owner}/${parts.repo}/pulls/${parts.number}/files?per_page=100`;
  const data = await ghFetch<any[]>(url);
  return data.map((f) => ({
    filename: f.filename,
    status: f.status,
    previous_filename: f.previous_filename,
  }));
}

export async function fetchFileAtSha(
  owner: string,
  repo: string,
  sha: string,
  path: string
): Promise<string | null> {
  // Raw content via the contents API. We use the raw media type to skip base64.
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(
    path
  )}?ref=${encodeURIComponent(sha)}`;
  const res = await fetch(url, {
    headers: { ...headers(), Accept: "application/vnd.github.raw" },
  });
  captureRateLimit(res);
  if (res.status === 404) return null; // file doesn't exist at this SHA (added/removed case)
  if (!res.ok) {
    const rl = res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0";
    throw new GithubError(`GitHub raw fetch ${res.status}`, res.status, rl);
  }
  return await res.text();
}

export function isSupportedSource(filename: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(filename);
}

export function pickLanguage(filename: string): "typescript" | "javascript" {
  return /\.(ts|tsx)$/i.test(filename) ? "typescript" : "javascript";
}
