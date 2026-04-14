---
name: nesr-brand
description: >
  Applies NESR (National Energy Services Reunited Corp.) official brand guidelines to any output.
  Use this skill whenever the user asks to create, style, or polish a Document (Word/PDF), 
  Excel spreadsheet, Report, Dashboard (HTML/React), or Presentation (PowerPoint) with NESR 
  branding. Trigger whenever the user mentions "NESR brand", "NESR style", "branded", "our 
  company template", or whenever producing any deliverable for NESR that should look professional 
  and on-brand. Always apply this skill when creating any business output for NESR, even if 
  the user doesn't explicitly say "brand" — if they work at NESR and want a deliverable, it 
  should be on-brand.
---

# NESR Brand Guidelines Skill

National Energy Services Reunited Corp. (NESR) brand application guide for all document types.

## Quick Reference — Brand Tokens

### Colors

| Role | Name | HEX | RGB |
|---|---|---|---|
| Primary | NESR Green | `#2A7E4F` | 42, 126, 79 |
| Primary | NESR Black | `#1F1F1D` | 31, 31, 29 |
| Secondary | Light Green (60%) | `#6AAF8E` | 106, 175, 142 |
| Secondary | Pale Green (20%) | `#C5E0D2` | 197, 224, 210 |
| Secondary | Mid Gray | `#58595B` | 88, 89, 91 |
| Secondary | Light Gray | `#D1D3D4` | 209, 211, 212 |
| Background | White | `#FFFFFF` | 255, 255, 255 |

**Usage rules:**
- NESR Green is the dominant brand color — use for headers, section dividers, chart series, table headers, slide title bars, footer bars.
- NESR Black is for primary body text and dark-background logos.
- Light Green and Pale Green for chart fills, alternating table rows, subtle backgrounds.
- Gray tones for secondary text, borders, and metadata.

### Typography

- **Primary typeface:** Arial (all weights: Regular, Bold, Black, Narrow, Italic)
- **Logo typeface:** Avenir (use only for recreating the NESR wordmark — for all other content use Arial)
- **Fallbacks:** Calibri → Helvetica → sans-serif
- Font sizes will vary by format (see per-format rules below).

### Logo

The logo asset lives at: `assets/nesr_logo.png` (black on transparent — for white/light backgrounds)  
Green background version: `assets/nesr_logo_green_bg.png` (for dark slide headers)

**Logo placement rules:**
- **Documents & Reports:** Top-left of page header, or centered on cover page.
- **Presentations:** Top-left corner of title slides; small top-right badge on content slides.
- **Dashboards:** Top-left navbar or header area.
- **Excel:** Top-left of the first sheet's header row.
- **Clear space:** Maintain at least 0.25× logo-height of whitespace on all sides.
- **Never** stretch, recolor (except approved variants), or place on busy backgrounds.

**Approved logo variants:**
1. Black on white — standard corporate templates (Word docs, reports, Excel)
2. White on dark/black — dark advert backgrounds
3. White on NESR Green — digital use, section dividers, presentation headers
4. White on Gray — equipment/coverall use

---

## Per-Format Application Guide

### 1. Word Documents (.docx)

Read `/mnt/skills/public/docx/SKILL.md` before generating. Apply NESR brand as follows:

**Cover Page:**
- Full-width NESR Green (`#2A7E4F`) block across top ~25% of page.
- NESR logo (white on green variant or black on white, top-left).
- Document title: Arial Bold, 28pt, White if on green block, else NESR Black.
- Subtitle/date: Arial Regular, 12pt, same color family.
- Bottom footer bar: thin NESR Green rule, Arial 9pt gray text with "National Energy Services Reunited Corp. | www.nesr.com".

**Body Pages:**
- Header: NESR logo (black, small ~1cm height) top-left; page number top-right; thin green rule below.
- Footer: thin green rule above; "National Energy Services Reunited Corp." left, page number right, Arial 8pt gray.
- Section headings: Arial Bold, 14pt, NESR Green `#2A7E4F`.
- Sub-headings: Arial Bold, 12pt, NESR Black.
- Body text: Arial Regular, 10-11pt, NESR Black.
- Tables: Header row — NESR Green fill, white Arial Bold 10pt. Alternating rows: white and Pale Green `#C5E0D2`.
- Accent lines/callout boxes: NESR Green left border, Pale Green background.

**Python-pptx color reference for python-docx:**
```python
from docx.shared import RGBColor, Pt, Inches
NESR_GREEN = RGBColor(42, 126, 79)
NESR_BLACK = RGBColor(31, 31, 29)
NESR_LIGHT_GREEN = RGBColor(106, 175, 142)
NESR_PALE_GREEN = RGBColor(197, 224, 210)
NESR_GRAY = RGBColor(88, 89, 91)
```

---

### 2. PowerPoint Presentations (.pptx)

Read `/mnt/skills/public/pptx/SKILL.md` before generating. Apply NESR brand as follows:

**Title Slide layout:**
- Background: White.
- Top band: Full-width rectangle, NESR Green, ~30% slide height.
- NESR logo (white on green) centered or top-left in the green band.
- Title: Arial Black, 36-40pt, NESR Black (below the green band).
- Subtitle/date: Arial Regular, 18pt, Mid Gray.
- Bottom accent: thin NESR Green line.

**Content Slides layout:**
- Background: White.
- Top bar: NESR Green rectangle, full-width, ~10% slide height.
  - Slide title: Arial Bold, 20pt, White, inside green bar.
  - Small NESR logo (white, ~0.6cm height) in top-right of green bar.
- Body text: Arial Regular, 16-18pt, NESR Black.
- Bullet point accent: NESR Green square bullets.
- Divider slides (section breaks): Full NESR Green background, section title in White Arial Black centered.
- Charts: First series NESR Green, second series Light Green, third series Mid Gray.
- Footer: Slide number right, "NESR Confidential" left (or appropriate label), Arial 8pt gray.

**python-pptx color reference:**
```python
from pptx.util import Pt, Inches, Emu
from pptx.dml.color import RGBColor
NESR_GREEN = RGBColor(0x2A, 0x7E, 0x4F)
NESR_BLACK = RGBColor(0x1F, 0x1F, 0x1D)
NESR_LIGHT_GREEN = RGBColor(0x6A, 0xAF, 0x8E)
NESR_PALE_GREEN = RGBColor(0xC5, 0xE0, 0xD2)
NESR_GRAY = RGBColor(0x58, 0x59, 0x5B)
```

---

### 3. Excel Spreadsheets (.xlsx)

Read `/mnt/skills/public/xlsx/SKILL.md` before generating. Apply NESR brand as follows:

**Sheet Header (rows 1–3):**
- Row 1: Merged across all columns — NESR Green fill. Insert NESR logo image top-left (from assets/). Sheet title in White Arial Bold 14pt centered.
- Row 2: Document metadata (date, author, version) — Pale Green fill, Arial 9pt gray.
- Row 3: Blank separator row.

**Column Headers (first data header row):**
- Fill: NESR Green. Font: Arial Bold 10pt White. Borders: thin white internal, no external.

**Data Rows:**
- Alternating: White and Pale Green (`#C5E0D2`) fills. Font: Arial 10pt NESR Black.
- Number formats: use commas for thousands, 2dp for currency/percentages.

**Totals/Summary Rows:**
- Fill: Light Green (`#6AAF8E`). Font: Arial Bold 10pt White.

**Charts:**
- Series 1: NESR Green. Series 2: Light Green. Series 3: Mid Gray. Series 4: Pale Green.
- Chart title: Arial Bold 12pt NESR Black.
- Plot area background: White. Gridlines: Light Gray.
- Legend: Arial 10pt, below chart.

**openpyxl color reference:**
```python
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
NESR_GREEN_FILL = PatternFill("solid", fgColor="2A7E4F")
NESR_PALE_FILL = PatternFill("solid", fgColor="C5E0D2")
NESR_LIGHT_FILL = PatternFill("solid", fgColor="6AAF8E")
NESR_WHITE_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=10)
NESR_BLACK_FONT = Font(name="Arial", color="1F1F1D", size=10)
NESR_HEADER_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=14)
```

---

### 4. HTML Dashboards & Reports

Apply NESR brand via CSS custom properties:

```css
:root {
  --nesr-green: #2A7E4F;
  --nesr-green-light: #6AAF8E;
  --nesr-green-pale: #C5E0D2;
  --nesr-black: #1F1F1D;
  --nesr-gray: #58595B;
  --nesr-gray-light: #D1D3D4;
  --nesr-white: #FFFFFF;
  --font-primary: Arial, Calibri, Helvetica, sans-serif;
}
```

**Layout:**
- Top navbar: `background: var(--nesr-green)`. Logo left (white variant). Nav links Arial Bold 13px white.
- Page title bar: `background: var(--nesr-green)`, white heading text.
- KPI cards: white background, `border-top: 4px solid var(--nesr-green)`, metric value in NESR Green.
- Tables: header `background: var(--nesr-green)`, white Arial Bold text. Alternating rows white / `var(--nesr-green-pale)`.
- Charts (use Chart.js or Recharts): primary color `#2A7E4F`, secondary `#6AAF8E`, tertiary `#58595B`.
- Footer: `background: var(--nesr-black)`, white Arial 11px text, include "National Energy Services Reunited Corp."
- Section headers: `border-left: 4px solid var(--nesr-green)`, Arial Bold 16px NESR Black.

---

## Brand Voice Reminders

When writing content within branded documents:
- **Visionary**: Forward-thinking, innovative language.
- **Reliable**: Dependable, transparent, ethical tone.
- **Accountable**: Resourceful, respectful, socially responsible.
- Use US English dictionary.
- Write about the Company using singular verbs ("NESR is...").
- Keep language clean, clear, and professional.

---

## Logo Asset Usage in Code

**python-docx (Word):**
```python
from docx.shared import Inches
doc.add_picture("public\nesr-logo.jpg", width=Inches(1.2))
```

**python-pptx (PowerPoint):**
```python
from pptx.util import Inches
slide.shapes.add_picture("apublic\nesr-logo.jpg", Inches(0.2), Inches(0.1), width=Inches(1.0))
```

**openpyxl (Excel):**
```python
from openpyxl.drawing.image import Image as XLImage
img = XLImage("public\nesr-logo.jpg")
img.width, img.height = 120, 100
ws.add_image(img, "A1")
```

**HTML:**
```html
<img src="public\nesr-logo.jpg" alt="NESR" style="height:48px;" />
```

---

## Checklist Before Delivering Any NESR Output

- [ ] NESR logo present (correct variant for background color)
- [ ] NESR Green (`#2A7E4F`) used for all primary headers, accents, chart series
- [ ] Arial font used throughout (Bold for headings, Regular for body)
- [ ] Footer includes "National Energy Services Reunited Corp."
- [ ] Color contrast is accessible (white text on green, black text on white/pale)
- [ ] Brand voice: professional, clear, US English
- [ ] No logo distortion or unapproved recoloring