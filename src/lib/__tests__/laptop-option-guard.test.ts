import { describe, expect, it } from 'vitest';
import { requireOneOf } from '@/lib/laptop-procurement/internals';
import { COUNTRY_OPTIONS, DEVICE_TYPE_OPTIONS } from '@/lib/laptopProcurement-utils';

describe('requireOneOf', () => {
  it('rejects the translated country that broke PLP01559/PLP01560', () => {
    expect(() => requireOneOf('المملكة العربية السعودية', COUNTRY_OPTIONS, 'Country')).toThrow(
      /must be one of the listed options/,
    );
  });
  it('rejects the translated device types', () => {
    for (const v of ['اللابتوب', 'سطح المكتب'])
      expect(() => requireOneOf(v, DEVICE_TYPE_OPTIONS, 'Type of device')).toThrow();
  });
  it('accepts the real values and returns the canonical spelling', () => {
    expect(requireOneOf('Saudi Arabia', COUNTRY_OPTIONS, 'Country')).toBe('Saudi Arabia');
    expect(requireOneOf('  saudi arabia ', COUNTRY_OPTIONS, 'Country')).toBe('Saudi Arabia');
    expect(requireOneOf('Laptop', DEVICE_TYPE_OPTIONS, 'Type of device')).toBe('Laptop');
  });
  it('still requires a value at all', () => {
    expect(() => requireOneOf('', COUNTRY_OPTIONS, 'Country')).toThrow(/required/);
  });
});
