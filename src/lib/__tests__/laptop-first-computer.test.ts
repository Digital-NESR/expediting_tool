import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIRST_COMPUTER_DECLARATION,
  getLaptopAvailableActions,
  laptopRequestHasExistingDevice,
  laptopRequestIsForSelf,
  laptopRequestNeedsFirstComputerDeclaration,
  REQUEST_TYPE_OPTIONS,
} from '@/lib/laptopProcurement-utils';

/**
 * "New Computer (Self)": an existing employee getting a company computer for the first time.
 *
 * It is a hybrid, and that is the whole risk. At the front it behaves like a self-service
 * request -- the requester is the recipient, so the directory fills their details in. After
 * that it behaves like a New Employee request -- there is no prior device for the IT Manager
 * to describe. Every screen that used to ask `request_type !== 'New Employee'` was asking the
 * second question in a way that was right only while New Employee was the only device-less
 * type, and would now demand the serial number of a machine that does not exist.
 *
 * So the predicates are the unit under test, and the source is checked for anything still
 * asking by hand.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the request types', () => {
  it('carries the new one without disturbing the three that existed', () => {
    expect(REQUEST_TYPE_OPTIONS).toEqual([
      'New Employee',
      'New Computer (Self)',
      'Upgrade/Replacement',
      'Unit',
    ]);
  });
});

describe('laptopRequestHasExistingDevice', () => {
  it('is false for both device-less types', () => {
    /* The first-time case is the new one. A new hire never had a device; an existing employee
       getting their first machine has not had one either. */
    expect(laptopRequestHasExistingDevice('New Employee')).toBe(false);
    expect(laptopRequestHasExistingDevice('New Computer (Self)')).toBe(false);
  });

  it('is true where there is something to replace', () => {
    expect(laptopRequestHasExistingDevice('Upgrade/Replacement')).toBe(true);
    expect(laptopRequestHasExistingDevice('Unit')).toBe(true);
  });

  it('survives padding and a missing value', () => {
    expect(laptopRequestHasExistingDevice('  New Computer (Self) ')).toBe(false);
    /* A null type is a row from before the column was reliable. Treated as having a device,
       which is the old default and keeps legacy records rendering as they always did. */
    expect(laptopRequestHasExistingDevice(null)).toBe(true);
  });
});

describe('laptopRequestIsForSelf', () => {
  it('covers every type except the one HR raises for somebody else', () => {
    expect(laptopRequestIsForSelf('New Computer (Self)')).toBe(true);
    expect(laptopRequestIsForSelf('Upgrade/Replacement')).toBe(true);
    expect(laptopRequestIsForSelf('Unit')).toBe(true);
    expect(laptopRequestIsForSelf('New Employee')).toBe(false);
  });
});

describe('laptopRequestNeedsFirstComputerDeclaration', () => {
  it('is the one type that carries a declaration', () => {
    expect(laptopRequestNeedsFirstComputerDeclaration('New Computer (Self)')).toBe(true);
    for (const other of ['New Employee', 'Upgrade/Replacement', 'Unit', '', null, undefined]) {
      expect(
        laptopRequestNeedsFirstComputerDeclaration(other),
        `${String(other)} should not carry one`,
      ).toBe(false);
    }
  });

  it('states the declaration in the words that were asked for', () => {
    expect(FIRST_COMPUTER_DECLARATION).toBe(
      'I declare that I have not previously received or been assigned a company computer.',
    );
  });
});

describe('what the IT Manager may do with it', () => {
  /* The IT Manager, on their own stage, with a request that has no assigned unit and is not
     on the procure-new path -- the state every request is in when it first arrives. */
  const actionsFor = (requestType: string) =>
    getLaptopAvailableActions(true, 'Submitted', false, false, requestType);

  it('cannot mark a first-time computer as repaired', () => {
    /* Nothing to repair. The old gate named New Employee, so this type would have offered
       "mark as repaired" on a device that does not exist. */
    expect(actionsFor('New Computer (Self)').canMarkRepaired).toBe(false);
    expect(actionsFor('New Employee').canMarkRepaired).toBe(false);
  });

  it('still offers it where there is a device', () => {
    expect(actionsFor('Upgrade/Replacement').canMarkRepaired).toBe(true);
    expect(actionsFor('Unit').canMarkRepaired).toBe(true);
  });

  it('leaves the rest of the chain alone', () => {
    /* Asked for explicitly: the flow after submission is the New Employee flow. Nothing about
       approvals or inventory should differ. */
    const first = actionsFor('New Computer (Self)');
    const hire = actionsFor('New Employee');
    expect(first.canApprove).toBe(hire.canApprove);
    expect(first.canReject).toBe(hire.canReject);
    expect(first.canAssignInventory).toBe(hire.canAssignInventory);
    expect(first.nextStatus).toBe(hire.nextStatus);
    expect(first.ownerLabel).toBe(hire.ownerLabel);
  });
});

describe('the declaration is required on the server, not only in the form', () => {
  const src = read('src/lib/laptop-procurement/write-requests.ts');

  it('refuses the type without it', () => {
    /* createLaptopRequest is a public POST endpoint and the checkbox is a convenience. */
    expect(src).toContain('laptopRequestNeedsFirstComputerDeclaration');
    expect(src).toContain('input.first_computer_declared !== true');
  });

  it('cannot stamp the column on a type that carries no declaration', () => {
    /* Narrowed server-side so a crafted payload cannot record a declaration against an
       Upgrade/Replacement, where it would read as evidence of something never claimed. */
    const narrowed = src.slice(src.indexOf('firstComputerDeclared:'));
    expect(narrowed.slice(0, 240)).toContain('laptopRequestNeedsFirstComputerDeclaration');
  });
});

describe('every screen asks through the predicate', () => {
  /* The files that decide whether to show or require the old device. A raw comparison left in
     any of them is the bug this whole shape exists to prevent, and it fails silently: the
     screen simply asks for a serial number nobody can give. */
  const FILES = [
    'src/app/laptop-procurement/components/LaptopRequestDetailClient.tsx',
    'src/lib/laptopProcurement-utils.ts',
  ];

  it.each(FILES)('%s decides the existing-device question through the helper', (file) => {
    const src = read(file);
    expect(src).toContain('laptopRequestHasExistingDevice');
    /* Only the definition itself may name the types. Anywhere else, a comparison against
       'New Employee' to mean "has no device" is the stale spelling. */
    const code = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');
    const stale = code.match(/requestType !== 'New Employee'|request_type !== 'New Employee'/g);
    expect(stale ?? [], `${file} still asks by naming the type`).toHaveLength(0);
  });
});
