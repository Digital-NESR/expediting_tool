import { describe, expect, it } from 'vitest';
import { describeDbError } from '@/lib/db/describe-error';

/**
 * Every one of these was, at some point, logged as `error: ""`.
 */
describe('describeDbError', () => {
  it('unwraps the AggregateError a failed connection actually throws', () => {
    // Exactly what `pg` rejects with when a host resolves to both ::1 and 127.0.0.1 and neither
    // answers: an AggregateError whose own message is empty.
    const err = new AggregateError(
      [
        Object.assign(new Error('connect ECONNREFUSED ::1:5432'), { code: 'ECONNREFUSED' }),
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
      ],
      '',
    );
    expect(err.message).toBe('');
    const described = describeDbError(err);
    expect(described).toContain('ECONNREFUSED');
    expect(described).toContain('nothing is listening');
  });

  it('collapses the same cause reported once per address', () => {
    const err = new AggregateError([
      Object.assign(new Error('a'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('b'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('c'), { code: 'ECONNREFUSED' }),
    ]);
    expect(describeDbError(err).match(/ECONNREFUSED/g)).toHaveLength(1);
  });

  it('keeps two different causes apart', () => {
    const err = new AggregateError([
      Object.assign(new Error('a'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('b'), { code: 'ETIMEDOUT' }),
    ]);
    const described = describeDbError(err);
    expect(described).toContain('ECONNREFUSED');
    expect(described).toContain('ETIMEDOUT');
  });

  it('explains the postgres codes an operator can act on', () => {
    expect(describeDbError(Object.assign(new Error(''), { code: '28000' }))).toContain(
      'pg_hba.conf',
    );
    expect(describeDbError(Object.assign(new Error(''), { code: '28P01' }))).toContain('password');
  });

  it('keeps the message for a code it has no sentence for', () => {
    const err = Object.assign(new Error('relation "vendors" does not exist'), { code: '42P01' });
    expect(describeDbError(err)).toContain('relation "vendors" does not exist');
    expect(describeDbError(err)).toContain('42P01');
  });

  it('never throws, whatever it is handed', () => {
    for (const value of [null, undefined, '', 0, {}, [], new Error('plain')]) {
      expect(() => describeDbError(value)).not.toThrow();
      expect(typeof describeDbError(value)).toBe('string');
    }
  });
});
