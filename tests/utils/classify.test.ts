import { describe, it, expect } from 'vitest';
import { classifyCuisine } from '../../src/utils/classify.js';

describe('classifyCuisine', () => {
  it('maps japanese_restaurant to 日式', () => {
    expect(classifyCuisine(['japanese_restaurant', 'restaurant'])).toBe('日式');
  });
  it('maps hot_pot_restaurant to 火鍋', () => {
    expect(classifyCuisine(['hot_pot_restaurant'])).toBe('火鍋');
  });
  it('maps hamburger_restaurant to 漢堡', () => {
    expect(classifyCuisine(['hamburger_restaurant'])).toBe('漢堡');
  });
  it('returns 其他 for unknown types', () => {
    expect(classifyCuisine(['restaurant', 'food'])).toBe('其他');
  });
  it('returns empty string for non-restaurant', () => {
    expect(classifyCuisine(['tourist_attraction'])).toBe('');
  });
  it('prioritises first known cuisine match', () => {
    expect(classifyCuisine(['sushi_restaurant', 'japanese_restaurant'])).toBe('壽司');
  });
});
