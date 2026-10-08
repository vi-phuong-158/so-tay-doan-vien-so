"""Extract the government article; never invent or infer administrative names.

Usage: python scripts/build-nq-unit-seed.py path/to/downloaded-government.html
The frozen JSON is provenance/build input; PostgreSQL is the runtime catalogue.
"""
import hashlib
import html
import json
import re
import sys
import unicodedata
import uuid
from pathlib import Path

SOURCE = 'https://xaydungchinhsach.chinhphu.vn/sap-xep-dvhc-danh-sach-148-xa-phuong-cua-tinh-phu-tho-119250623074347981.htm'
raw = Path(sys.argv[1]).read_bytes()
text = unicodedata.normalize('NFC', re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', raw.decode('utf-8')))))
units = re.findall(r'tên gọi là (xã|phường) ([^.]+)\.', text)
unchanged = re.search(r'02 xã không thực hiện sắp xếp là xã ([^,]+), xã ([^.)]+)', text)
assert unchanged, 'Missing unchanged communes clause'
units += [('xã', name.strip()) for name in unchanged.groups()]
assert len(units) == len(set(units)) == 148
assert sum(kind == 'xã' for kind, _ in units) == 133
assert sum(kind == 'phường' for kind, _ in units) == 15
rows = []
for order, (kind, short_name) in enumerate(units, 1):
    code = f'PT-NQ-{order:03d}'
    rows.append(dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL, f'{SOURCE}#{code}')), code=code,
                     name=f'{kind.capitalize()} {short_name}', short_name=short_name,
                     unit_type='xa' if kind == 'xã' else 'phuong', display_order=order))
target = Path('scripts/data/nq-competition-units.json')
target.write_text(json.dumps(dict(source=SOURCE, resolution='1676/NQ-UBTVQH15',
    verified_at='2026-10-08', source_sha256=hashlib.sha256(raw).hexdigest(),
    code_convention='Internal stable PT-NQ ordinal, not an official administrative code',
    units=rows), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
values = []
for row in rows:
    quoted = ["'" + str(row[key]).replace("'", "''") + "'" for key in ['id', 'code', 'name', 'short_name', 'unit_type']]
    values.append('(' + ','.join(quoted + [str(row['display_order'])]) + ')')
Path('supabase/seeds/nq_competition_units.sql').write_text(
    '-- Source: ' + SOURCE + '\n-- Verified 2026-10-08: 133 xa + 15 phuong. Internal codes are frozen.\n'
    + 'insert into public.nq_competition_units(id,code,name,short_name,unit_type,display_order) values\n'
    + ',\n'.join(values) + '\non conflict (code) do nothing;\n'
    + "do $$ begin if (select count(*) from public.nq_competition_units where active) <> 148 then raise exception 'NQ_UNIT_COUNT_EXPECTED_148'; end if; end $$;\n",
    encoding='utf-8')
print('NQ_UNIT_SOURCE_VALIDATED: 148 / xa=133 / phuong=15 / duplicates=0')
