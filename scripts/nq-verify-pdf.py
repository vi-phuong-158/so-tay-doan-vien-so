"""Validate and render the actual Chromium PDF of an owned synthetic certificate."""
import json
import sys
from pathlib import Path
import pdfplumber
import pypdfium2 as pdfium
from pypdf import PdfReader

folder = Path(sys.argv[1])
path = folder / 'certificate.pdf'
reader = PdfReader(path)
assert len(reader.pages) == 1, 'Must be exactly one page'
page = reader.pages[0]
width, height = float(page.mediabox.width), float(page.mediabox.height)
assert abs(width - 841.89) < 2 and abs(height - 595.28) < 2, 'A4 landscape'
text = page.extract_text()
certificate = json.loads((folder / 'result-24.json').read_text(encoding='utf-8'))['certificate']
for value in [certificate['full_name'].upper(), certificate['organization_name'], certificate['code']]:
    assert ' '.join(value.split()) in ' '.join(text.split()), f'Missing certificate text: {value}'
for forbidden in ['Trang chủ', 'Công việc', 'Cá nhân', 'Tải chứng nhận (PNG)', 'In / Lưu PDF']:
    assert forbidden not in text, 'App chrome leaked into PDF'
with pdfplumber.open(path) as pdf:
    assert all(c['x0'] >= 0 and c['x1'] <= width + 1 and c['top'] >= 0 and c['bottom'] <= height + 1
               for c in pdf.pages[0].chars), 'Text clipped outside page'
doc = pdfium.PdfDocument(path)
render = doc[0].render(scale=2).to_pil()
render.save(folder / 'certificate-pdf-render.png')
dark = sum(count for count, value in render.convert('L').getcolors(maxcolors=256) if value < 220)
assert dark > 10000, 'Blank/abnormally empty PDF'
receipt = dict(pages=1,width_pt=width,height_pt=height,bytes=path.stat().st_size,
               text_characters=len(text),dark_pixels=dark,synthetic=True)
(folder / 'pdf-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print('NQFINAL_A4_PDF_TEXT_BOUNDS_RENDER_PASS',json.dumps(receipt))
