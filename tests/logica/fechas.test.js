import { test, expect } from 'vitest';
import { hoyLocal, diasEntre } from '../../src/logica/fechas.js';

test('hoyLocal usa hora local', () => {
  expect(hoyLocal(new Date(2026, 10, 30, 23, 0))).toBe('2026-11-30');
  expect(hoyLocal(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
});
test('diasEntre', () => {
  expect(diasEntre('2026-11-10', '2026-11-24')).toBe(14);
  expect(diasEntre('2026-11-24', '2026-11-10')).toBe(-14);
});
