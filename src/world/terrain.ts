// Seeded world generation stays independent of rendering and future simulation.
export function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function height(x: number, z: number): number {
  const edge = Math.min(1, Math.max(0, (Math.hypot(x, z) - 15) / 22));
  return -0.2 + edge * (1.8 + Math.sin(x * .12) * Math.cos(z * .16) * 2.4) + Math.sin(x * .24) * Math.cos(z * .21) * .18;
}
export const WORLD_SEED = 1847;
