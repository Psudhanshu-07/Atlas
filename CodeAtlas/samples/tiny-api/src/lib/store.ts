// In-memory health-check store. Single owner of service state.

import { formatRatio, isHealthy } from "./format";

export interface Check {
  at: number;
  ok: boolean;
  latencyMs: number;
}

export interface Service {
  name: string;
  checks: Check[];
}

const services = new Map<string, Service>();

export function register(name: string): Service {
  const existing = services.get(name);
  if (existing) return existing;
  const service: Service = { name, checks: [] };
  services.set(name, service);
  return service;
}

export function record(name: string, ok: boolean, latencyMs: number): Check {
  const service = register(name);
  const check: Check = { at: Date.now(), ok, latencyMs };
  service.checks.push(check);
  if (service.checks.length > 100) service.checks.shift();
  return check;
}

export function summary(name: string): {
  name: string;
  total: number;
  successes: number;
  ratio: string;
  healthy: boolean;
} | null {
  const service = services.get(name);
  if (!service) return null;
  const total = service.checks.length;
  const successes = service.checks.filter((c) => c.ok).length;
  return {
    name: service.name,
    total,
    successes,
    ratio: formatRatio(total === 0 ? 0 : successes / total),
    healthy: isHealthy(successes, total),
  };
}

export function allSummaries(): NonNullable<ReturnType<typeof summary>>[] {
  return [...services.keys()]
    .map((name) => summary(name))
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

export function reset(): void {
  services.clear();
}
