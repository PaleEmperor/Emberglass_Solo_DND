import crypto from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}${Date.now().toString(36)}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
