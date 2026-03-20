import type { Place } from '../types.js';

export function filterNewPlaces(candidates: Place[], existing: Place[]): Place[] {
  const existingIds = new Set(existing.map(p => p.place_id));
  return candidates.filter(p => !existingIds.has(p.place_id));
}
