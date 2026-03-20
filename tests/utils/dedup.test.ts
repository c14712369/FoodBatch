import { describe, it, expect } from 'vitest';
import { filterNewPlaces } from '../../src/utils/dedup.js';
import type { Place } from '../../src/types.js';

const existing: Place[] = [
  { place_id: 'abc123' } as Place,
  { place_id: 'def456' } as Place,
];

describe('filterNewPlaces', () => {
  it('removes places already in existing list', () => {
    const candidates = [{ place_id: 'abc123' } as Place, { place_id: 'new001' } as Place];
    expect(filterNewPlaces(candidates, existing)).toHaveLength(1);
    expect(filterNewPlaces(candidates, existing)[0]!.place_id).toBe('new001');
  });

  it('returns all if none are duplicates', () => {
    const candidates = [{ place_id: 'new001' } as Place];
    expect(filterNewPlaces(candidates, existing)).toHaveLength(1);
  });

  it('returns empty array if all are duplicates', () => {
    const candidates = [{ place_id: 'abc123' } as Place];
    expect(filterNewPlaces(candidates, existing)).toHaveLength(0);
  });

  it('handles empty existing list', () => {
    const candidates = [{ place_id: 'abc123' } as Place];
    expect(filterNewPlaces(candidates, [])).toHaveLength(1);
  });
});
