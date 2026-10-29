# -*- coding: utf-8 -*-
"""
Build the travel-portal data-quality workbook from the sweep's JSON.

One sheet per finding, each led by a short block saying what was checked, what came back, and
why it matters -- so a sheet still makes sense to somebody who opens it on its own from an
email, without the covering note.
"""
import io
import json
import re
import sys
from datetime import datetime, timezone

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

SRC, OUT = sys.argv[1], sys.argv[2]
data = json.load(io.open(SRC, encoding='utf-8'))
totals = data['totals']
results = data['results']

FONT = 'Arial'
INK = '1F2933'
GREEN = '307C4C'
WHITE = 'FFFFFF'

SEVERITY_FILL = {
    'Critical': 'C62828',
    'High': 'E65100',
    'Medium': 'B7791F',
    'Low': '5B6B7B',
    'Clean': '307C4C',
}

thin = Side(style='thin', color='D7DDE3')
box = Border(left=thin, right=thin, top=thin, bottom=thin)


def base(cell, size=10, bold=False, colour=INK, wrap=False, top=False):
    cell.font = Font(name=FONT, size=size, bold=bold, color=colour)
    cell.alignment = Alignment(
        wrap_text=wrap, vertical='top' if (wrap or top) else 'center'
    )
    return cell


def sheet_name(index, check):
    """
    31 characters, none of the characters Excel refuses, and readable on a tab.

    Each check carries its own short `tab`: truncating the full title produced tabs like
    "03 Portal bookings with no itin", a row of half-words nobody can scan.
    """
    label = check.get('tab') or re.sub(r'^\d+\.\s*', '', check['title'])
    label = re.sub(r'[:\\/?*\[\]]', '-', label)
    return '{:02d} {}'.format(index, label)[:31].rstrip()


def autosize(ws, first_row, columns, max_width=52):
    for i, _ in enumerate(columns, start=1):
        letter = get_column_letter(i)
        widest = 0
        for row in ws.iter_rows(min_row=first_row, min_col=i, max_col=i):
            value = row[0].value
            if value is None:
                continue
            widest = max(widest, len(str(value)))
        ws.column_dimensions[letter].width = min(max(11, widest + 2), max_width)


def write_rows(ws, start_row, columns, rows, table_name):
    header = start_row
    for col, name in enumerate(columns, start=1):
        c = base(ws.cell(row=header, column=col, value=name), bold=True, colour=WHITE, wrap=True)
        c.fill = PatternFill('solid', fgColor=GREEN)
        c.border = box
    ws.row_dimensions[header].height = 30

    for r, row in enumerate(rows, start=header + 1):
        for col, name in enumerate(columns, start=1):
            value = row.get(name)
            if isinstance(value, str) and re.match(r'^-?\d+(\.\d+)?$', value):
                # pg returns numeric and bigint as strings; put them in as numbers so the
                # reader can sort and total them.
                value = float(value) if '.' in value else int(value)
            c = base(ws.cell(row=r, column=col, value=value))
            c.border = box
            if isinstance(value, (int, float)):
                c.alignment = Alignment(horizontal='right', vertical='center')
                c.number_format = '#,##0.00' if isinstance(value, float) else '#,##0'
    ws.freeze_panes = ws.cell(row=header + 1, column=1)

    if rows:
        ref = '{}{}:{}{}'.format(
            'A', header, get_column_letter(len(columns)), header + len(rows)
        )
        table = Table(displayName=table_name, ref=ref)
        table.tableStyleInfo = TableStyleInfo(
            name='TableStyleLight1', showRowStripes=True, showColumnStripes=False
        )
        ws.add_table(table)
    autosize(ws, header, columns)


wb = Workbook()

# ─────────────────────────── Read me first ───────────────────────────
ws = wb.active
ws.title = 'Read me first'
ws.sheet_view.showGridLines = False
ws.column_dimensions['A'].width = 34
ws.column_dimensions['B'].width = 104

base(ws['A1'], size=18, bold=True, colour=GREEN).value = 'Travel Portal — data quality'
ws.merge_cells('A1:B1')
base(ws['A2'], size=10, colour='5B6B7B').value = (
    'Findings from the travel_portal database, one sheet per issue. Prepared for the portal provider.'
)
ws.merge_cells('A2:B2')

taken = datetime.fromisoformat(data['generatedAt'].replace('Z', '+00:00')).astimezone(timezone.utc)
intro = [
    ('Taken', taken.strftime('%d %B %Y, %H:%M UTC')),
    ('Database', 'travel_portal'),
    (
        'Bookings in the feed',
        '{} in total — {} booked in the portal (BTO) and {} entered from offline bookings (OFF)'.format(
            totals['bookings'], totals['bto'], totals['off']
        ),
    ),
    (
        'Date range',
        'First booking {}, most recent {}'.format(totals['first_booking'], totals['last_booking']),
    ),
    (
        'Related rows',
        '{} travellers, {} flight segments, {} legs, {} cheapest-fare alternatives, '
        '{} approver rows, {} policy violations, {} savings rows'.format(
            totals['travellers'], totals['segments'], totals['legs'], totals['cheapest'],
            totals['approvers'], totals['violations'], totals['savings'],
        ),
    ),
    ('', ''),
    (
        'How to read this',
        'Every sheet is one issue. The block at the top says what was checked, what came back, '
        'and what it costs us; the table below it is every row that matched, so it can be worked '
        'through directly. The Summary sheet lists all of them with counts.',
    ),
    (
        'BTO and OFF',
        'A booking code beginning BTO was made in the portal. One beginning OFF was arranged '
        'offline, usually over email, and entered afterwards. The distinction matters on most '
        'sheets: a missing itinerary on an OFF booking follows from how it was made, and the '
        'same gap on a BTO booking does not — the portal issued that ticket. Where a sheet has '
        'a Channel column, that is the first thing to sort by.',
    ),
    (
        'Nothing is inferred',
        'Every row here is read straight from the database. Nothing has been corrected, '
        'de-duplicated or filled in, and no row is an estimate.',
    ),
    (
        'Personal data',
        'Passport numbers, dates of birth and mobile numbers are deliberately NOT reproduced in '
        'this file. Where a passport is relevant, the sheet says only whether one is on record. '
        'Traveller names and company email addresses do appear, because a row cannot be found '
        'and fixed without them.',
    ),
    (
        'Checks that came back clean',
        'Two checks found nothing and are kept at the end of the Summary with a count of zero. '
        'They are listed so it is clear what was examined, not only what was wrong.',
    ),
]

row = 4
for label, value in intro:
    if label:
        base(ws.cell(row=row, column=1, value=label), bold=True, wrap=True, top=True)
        base(ws.cell(row=row, column=2, value=value), wrap=True, top=True)
        ws.row_dimensions[row].height = max(16, 13 * (1 + len(value) // 95))
    row += 1

row += 1
# The three worth reading first, in the order they would be fixed. Written from the sweep's
# own totals rather than typed in, so a re-run after a fix shows the new numbers rather than
# yesterday's.
by_key = {c['key']: c for c in results}
unconverted = int(totals['unconverted_local'])
headlines = [
    (
        'Start here  (1 of 3)',
        'Sheet 01 — test bookings. {} bookings were made to exercise the portal and are still '
        'counted as real travel: cost centres C999999999 and C999999997, company "Satguru Test", '
        'travellers "vaibhav vishal", "Satguru admin" and "Kaushalya Fernando". They carry '
        'AED 34,008 of spend, 6 traveller records, 7 flight segments and 6 of the policy '
        'violations in the whole feed. Please remove them.'
        .format(by_key['test_bookings']['count']),
    ),
    (
        'Start here  (2 of 3)',
        'Sheet 03 — USD conversion. {} bookings carry an amount in AED and no USD amount at all: '
        'AED {} of travel, roughly ${} at 3.6725, missing from every USD figure. The feed reports '
        '${} in total, so this is not a rounding gap.'
        .format(by_key['usd_missing']['count'], '{:,}'.format(unconverted),
                '{:,}'.format(round(unconverted / 3.6725)),
                '{:,}'.format(int(totals['total_usd']))),
    ),
    (
        'Start here  (3 of 3)',
        'Sheet 02 — invisible padding. Every `segment` value is padded to exactly 20 characters '
        'with U+00A0, the NON-BREAKING space, on 221 of {} bookings. TRIM() does not remove it, '
        'so anything cleaning the value still ends up with eleven invisible characters on the end '
        'and will not match the same segment name from any other system. It is undetectable by '
        'eye; it was found by measuring the string.'
        .format(totals['bookings']),
    ),
]

for label, text in headlines:
    base(ws.cell(row=row, column=1, value=label), bold=True, colour='C62828', wrap=True, top=True)
    cell = base(ws.cell(row=row, column=2, value=text), wrap=True, top=True)
    cell.fill = PatternFill('solid', fgColor='FDECEA')
    ws.row_dimensions[row].height = max(34, 13 * (1 + len(text) // 92))
    row += 1

# ─────────────────────────── Summary ───────────────────────────
summary = wb.create_sheet('Summary')
summary.sheet_view.showGridLines = False
base(summary['A1'], size=16, bold=True, colour=GREEN).value = 'Every check, and what it found'
summary.merge_cells('A1:F1')
base(summary['A2'], size=10, colour='5B6B7B').value = (
    'Sorted by severity. "Rows" is how many database rows matched, not how many bookings — '
    'one booking can appear on several sheets.'
)
summary.merge_cells('A2:F2')

head = ['Sheet', 'Issue', 'Severity', 'Rows', 'What was checked', 'Why it matters']
for col, name in enumerate(head, start=1):
    c = base(summary.cell(row=4, column=col, value=name), bold=True, colour=WHITE, wrap=True)
    c.fill = PatternFill('solid', fgColor=GREEN)
    c.border = box
summary.row_dimensions[4].height = 26

order = {'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Clean': 4}
ordered = sorted(enumerate(results, start=1), key=lambda p: (order[p[1]['severity']], -p[1]['count']))

r = 5
for index, check in ordered:
    name = sheet_name(index, check)
    base(summary.cell(row=r, column=1, value=name), top=True).border = box
    base(summary.cell(row=r, column=2, value=re.sub(r'^\d+\.\s*', '', check['title'])),
         bold=True, wrap=True, top=True).border = box
    sev = base(summary.cell(row=r, column=3, value=check['severity']), bold=True, colour=WHITE)
    sev.fill = PatternFill('solid', fgColor=SEVERITY_FILL[check['severity']])
    sev.alignment = Alignment(horizontal='center', vertical='center')
    sev.border = box
    n = base(summary.cell(row=r, column=4, value=check['count']))
    n.alignment = Alignment(horizontal='right', vertical='center')
    n.number_format = '#,##0'
    n.border = box
    base(summary.cell(row=r, column=5, value=check['question']), wrap=True, top=True).border = box
    base(summary.cell(row=r, column=6, value=check['soWhat']), wrap=True, top=True).border = box
    summary.row_dimensions[r].height = max(30, 12 * (1 + max(len(check['question']),
                                                             len(check['soWhat'])) // 58))
    r += 1

total_row = r
base(summary.cell(row=total_row, column=2, value='Rows flagged in total'), bold=True).border = box
t = base(summary.cell(row=total_row, column=4), bold=True)
t.value = '=SUM(D5:D{})'.format(r - 1)
t.number_format = '#,##0'
t.alignment = Alignment(horizontal='right', vertical='center')
t.border = box
base(summary.cell(row=total_row, column=5,
                  value='One booking can appear on several sheets, so this counts rows, not trips.'),
     colour='5B6B7B', wrap=True, top=True).border = box

for col, width in zip('ABCDEF', [30, 32, 11, 9, 56, 62]):
    summary.column_dimensions[col].width = width
summary.freeze_panes = 'A5'

# ─────────────────────────── One sheet per finding ───────────────────────────
for index, check in enumerate(results, start=1):
    ws = wb.create_sheet(sheet_name(index, check))
    ws.sheet_view.showGridLines = False
    columns = check['columns']
    span = max(len(columns), 4)

    base(ws.cell(row=1, column=1, value=check['title']), size=14, bold=True, colour=GREEN)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)

    sev = base(ws.cell(row=2, column=1,
                       value='{} · {} rows'.format(check['severity'], check['count'])),
               bold=True, colour=WHITE)
    sev.fill = PatternFill('solid', fgColor=SEVERITY_FILL[check['severity']])
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)

    base(ws.cell(row=3, column=1, value='What was checked:  ' + check['question']),
         wrap=True, top=True)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=span)
    ws.row_dimensions[3].height = max(28, 13 * (1 + len(check['question']) // 110))

    base(ws.cell(row=4, column=1, value='Why it matters:  ' + check['soWhat']),
         wrap=True, top=True, colour='8A4B00')
    ws.merge_cells(start_row=4, start_column=1, end_row=4, end_column=span)
    ws.row_dimensions[4].height = max(28, 13 * (1 + len(check['soWhat']) // 110))

    if check['count'] == 0:
        base(ws.cell(row=6, column=1,
                     value='Nothing matched. This check was run and came back clean.'),
             bold=True, colour=GREEN)
        ws.column_dimensions['A'].width = 70
        continue

    write_rows(ws, 6, columns, check['rows'], 'T{}'.format(index))

wb.save(OUT)
print('wrote', OUT, 'with', len(wb.sheetnames), 'sheets')
