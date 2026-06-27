import { describe, expect, it } from 'vitest';
import { reorderIds } from './reorder';

describe('reorderIds', () => {
  it('moves an item down after the target', () => {
    expect(reorderIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });

  it('moves an item up before the target', () => {
    expect(reorderIds(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('keeps the original reference for an invalid move', () => {
    const ids = ['a', 'b'];
    expect(reorderIds(ids, 'a', 'a')).toBe(ids);
    expect(reorderIds(ids, 'missing', 'b')).toBe(ids);
  });
});
