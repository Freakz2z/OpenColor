import { describe, it, expect } from 'vitest';
import { hexToRgb, isValidHex, classifyFamily, rgbToHex } from './format';

describe('format', () => {
  it('hexToRgb parses 6-char hex', () => {
    expect(hexToRgb('#FF0000')).toEqual([255, 0, 0]);
    expect(hexToRgb('#00ff00')).toEqual([0, 255, 0]);
    expect(hexToRgb('#0000FF')).toEqual([0, 0, 255]);
  });

  it('isValidHex accepts 6-char hex (with or without #)', () => {
    expect(isValidHex('#FF00CC')).toBe(true);
    expect(isValidHex('FF00CC')).toBe(true);
    expect(isValidHex('#fff')).toBe(false); // 3-char shorthand is rejected by isValidHex — normalizeHex handles that
    expect(isValidHex('not a color')).toBe(false);
  });

  it('classifyFamily buckets basic hues', () => {
    expect(classifyFamily('#FF0000')).toBe('red');
    expect(classifyFamily('#00FF00')).toBe('green');
    expect(classifyFamily('#808080')).toMatch(/gray|neutral/);
  });

  it('rgbToHex round-trips with hexToRgb', () => {
    const hex = '#A1B2C3';
    expect(rgbToHex(...hexToRgb(hex))).toBe(hex);
  });
});