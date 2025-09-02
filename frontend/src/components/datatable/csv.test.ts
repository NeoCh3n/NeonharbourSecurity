import { describe, it, expect } from 'vitest';
import { toCSV } from './csv';

describe('toCSV', () => {
  it('serializes simple rows', () => {
    const csv = toCSV([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(csv).toContain('a,b');
    expect(csv).toContain('1,x');
    expect(csv).toContain('2,y');
  });

  it('escapes commas and quotes', () => {
    const csv = toCSV([{ a: 'a,b', b: '"q"' }]);
    expect(csv).toBe('a,b\n"a,b","""q"""');
  });
});
