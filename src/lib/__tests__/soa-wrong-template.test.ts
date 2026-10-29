import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { UnreadableStatementError, parseSupplierWorkbook } from '@/lib/soa/submission-lines';
import { StatementRejected, storeStatement } from '@/lib/soa/submission-store';

/**
 * What a champion is told when the workbook is not the statement template.
 *
 * This is the refusal that actually gets hit. HQ Dubai lost time to it in the Q3 2026 cycle: a
 * champion uploaded the wrong workbook, was told "Could not find an Invoice Number column in the
 * first 40 rows. Is this the statement template?", and read that as the tool refusing to accept
 * any further uploads at all rather than as a complaint about the file.
 *
 * The message has to do the diagnosis, because the parser is the only party that can. It knows
 * which sheet it opened, which sheets it passed over, and what the columns in front of it say.
 *
 * Two layers, tested as two. The parser diagnoses the file and stops there; `storeStatement`
 * adds where to get the right one, which differs by who is uploading. Both rejections below
 * happen before any database work, so they can be exercised without one.
 */

async function workbook(sheets: { name: string; rows: unknown[][] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const ws = wb.addWorksheet(name);
    for (const row of rows) ws.addRow(row);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const refusal = async (bytes: Buffer): Promise<string> => {
  try {
    await parseSupplierWorkbook(bytes);
  } catch (err) {
    expect(err).toBeInstanceOf(UnreadableStatementError);
    return (err as Error).message;
  }
  throw new Error('expected the workbook to be refused');
};

describe('uploading the wrong workbook', () => {
  it('says plainly that it is the wrong file, not that something went wrong', async () => {
    const message = await refusal(
      await workbook([
        {
          name: 'Sheet1',
          rows: [
            ['PO Number', 'Item', 'Qty', 'Rate'],
            ['4100007296', 'Pump', 2, 50],
          ],
        },
      ]),
    );
    expect(message).toContain('not the statement template');
    expect(message).toContain('Invoice Number');
  });

  /* The single most useful line: it tells the reader which of their files they grabbed. */
  it('lists the columns it actually found', async () => {
    const message = await refusal(
      await workbook([
        {
          name: 'Sheet1',
          rows: [
            ['PO Number', 'Item', 'Qty', 'Rate'],
            ['4100007296', 'Pump', 2, 50],
          ],
        },
      ]),
    );
    expect(message).toContain('"PO Number"');
    expect(message).toContain('"Item"');
  });

  /* A long header row would push the actionable part of the message off the end. */
  it('shows six columns and counts the rest', async () => {
    const wide = Array.from({ length: 11 }, (_, i) => `Column ${i + 1}`);
    const message = await refusal(await workbook([{ name: 'Sheet1', rows: [wide] }]));
    expect(message).toContain('"Column 1"');
    expect(message).toContain('"Column 6"');
    expect(message).not.toContain('"Column 7"');
    expect(message).toContain('and 5 more');
  });

  /* Half the answer when it applies: the statement is often on the tab next to the one read. */
  it('names the sheet it read, and the others, when there is a choice', async () => {
    const message = await refusal(
      await workbook([
        { name: 'Cover', rows: [['Supplier', 'NESR']] },
        { name: 'Balances', rows: [['Account', 'Total']] },
      ]),
    );
    expect(message).toContain('"Cover"');
    expect(message).toContain('"Balances"');
  });

  it('does not bother naming the sheet when there is only one', async () => {
    const message = await refusal(await workbook([{ name: 'Sheet1', rows: [['Item', 'Qty']] }]));
    expect(message).not.toContain('It read the');
  });

  it('handles an empty sheet without claiming it found columns', async () => {
    const message = await refusal(await workbook([{ name: 'Sheet1', rows: [] }]));
    expect(message).toContain('empty');
    expect(message).not.toContain('The columns in it are');
  });

  it('reads as one column, not "the columns are", when there is one', async () => {
    const message = await refusal(await workbook([{ name: 'Sheet1', rows: [['Ageing report']] }]));
    expect(message).toContain('The only column in it is "Ageing report"');
  });

  /* The sentence is there to say something new. Listing the sheet it read among "the others"
     would repeat it and read as a mistake. */
  it('lists the other sheets without repeating the one it read', async () => {
    const message = await refusal(
      await workbook([
        { name: 'Cover', rows: [['Supplier']] },
        { name: 'Ageing', rows: [['Account']] },
      ]),
    );
    expect(message).toContain('It read the "Cover" sheet; the workbook also has "Ageing"');
  });

  /* The parser stops at the diagnosis: it serves a champion and a supplier, who fetch the
     template from different places, and only the caller knows which is which. */
  it('leaves where-to-get-it to the caller', async () => {
    const message = await refusal(await workbook([{ name: 'Sheet1', rows: [['Item']] }]));
    expect(message).not.toContain('Nothing has been filed');
    expect(message).not.toContain('link in this box');
  });
});

describe('what the uploader is told to do next', () => {
  const rejection = async (bytes: Buffer, selfService: boolean): Promise<string> => {
    try {
      await storeStatement({
        kind: 'workbook',
        entryId: 1,
        countryCycleId: 1,
        vendorNo: '0001105483',
        vendorName: 'Abu Dhabi National Takaful Co',
        countryId: 'HQ',
        cycleLabel: 'Q3 2026',
        fileName: 'wrong-file.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: bytes,
        uploadedBy: 'someone@nesr.com',
        actorLabel: 'someone@nesr.com',
        selfService,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(StatementRejected);
      return (err as Error).message;
    }
    throw new Error('expected the upload to be rejected');
  };

  const wrongFile = async () =>
    workbook([{ name: 'Sheet1', rows: [['PO Number', 'Material', 'Qty']] }]);

  it('sends a champion to the template in the dialog', async () => {
    const message = await rejection(await wrongFile(), false);
    expect(message).toContain('not the statement template');
    expect(message).toContain("Download this vendor's own template from the link in this box");
    expect(message).toContain('Nothing has been filed');
  });

  /* A supplier has no portal to fetch it from; theirs came attached to the request. Telling
     them to use a link that is not on their screen is how a refusal stops being actionable. */
  it('sends a supplier back to the email they were sent', async () => {
    const message = await rejection(await wrongFile(), true);
    expect(message).toContain('attached to the statement request we emailed you');
    expect(message).not.toContain('link in this box');
    expect(message).toContain('Nothing has been saved');
  });

  /* The right workbook, returned blank, is a different mistake and reads as one. */
  it('separates an unfilled template from the wrong file', async () => {
    const blank = await workbook([
      { name: 'SOA', rows: [['Invoice Number', 'Total Amount Outstanding']] },
    ]);
    const message = await rejection(blank, false);
    expect(message).toContain('That is the statement template, but there are no invoice rows');
    expect(message).not.toContain('not the statement template');
  });

  /* A file renamed to .xlsx is still whatever it was. */
  it('explains a file that is not a workbook at all', async () => {
    const message = await refusal(Buffer.from('Invoice Number,Amount\nINV-1,100\n'));
    expect(message).toContain('could not be opened as a workbook');
    expect(message).toContain('re-saved as .xlsx');
    expect(message).toContain('Nothing has been filed');
  });

  /* The real template still parses. The guard against making the refusal so eager it refuses
     the thing it is asking for. */
  it('still accepts the statement template', async () => {
    const bytes = await workbook([
      {
        name: 'SOA',
        rows: [
          [
            'Legal Entity',
            'Invoice Number',
            'Invoice Date',
            'PO Number',
            'Currency',
            'Total Amount Outstanding',
          ],
          ['NESR', 'INV-001', '2026-09-30', '4100007296', 'AED', 1500],
        ],
      },
    ]);
    const { lines } = await parseSupplierWorkbook(bytes);
    expect(lines).toHaveLength(1);
    expect(lines[0].invoiceNumber).toBe('INV-001');
  });

  /* The template sheet is found by name even when it is not the first tab, which is why the
     sheet-naming branch above must not fire for a workbook that is actually fine. */
  it('finds the SOA sheet behind a cover tab', async () => {
    const bytes = await workbook([
      { name: 'Instructions', rows: [['Please fill in the SOA tab']] },
      {
        name: 'SOA',
        rows: [
          ['Invoice Number', 'Total Amount Outstanding'],
          ['INV-002', 250],
        ],
      },
    ]);
    const { lines } = await parseSupplierWorkbook(bytes);
    expect(lines).toHaveLength(1);
  });
});
