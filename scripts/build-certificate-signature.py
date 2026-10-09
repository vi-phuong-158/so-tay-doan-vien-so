"""Build the browser-facing NQ13 certificate seal+signature derivative.

Input : design-source/nq13-certificate/chu-ky-owner-source.png  (owner-supplied, never served)
Output: src/assets/certificate/chu-ky-certificate.png           (cropped + downscaled, served via Vite)

The seal and signature stay in ONE image: only fully transparent padding is cropped, the whole
image is scaled uniformly (no re-drawing, no recolouring, no splitting).
Run: python3 scripts/build-certificate-signature.py   (needs Pillow + numpy)
"""
import hashlib
import pathlib

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'design-source/nq13-certificate/chu-ky-owner-source.png'
OUTPUT = ROOT / 'src/assets/certificate/chu-ky-certificate.png'
SOURCE_SHA256 = 'BFB2B8445D7B1FC22372880331ED013D08427212B0DDD1E9C1569F0E91881F28'
TARGET_WIDTH = 1000
PADDING = 12  # source pixels kept around the visible ink so anti-aliased edges are never clipped

if hashlib.sha256(SOURCE.read_bytes()).hexdigest().upper() != SOURCE_SHA256:
    raise SystemExit('Owner source asset hash mismatch; refusing to build a derivative.')

image = Image.open(SOURCE).convert('RGBA')
ys, xs = np.nonzero(np.array(image.split()[3]))
box = (
    max(0, int(xs.min()) - PADDING),
    max(0, int(ys.min()) - PADDING),
    min(image.width, int(xs.max()) + 1 + PADDING),
    min(image.height, int(ys.max()) + 1 + PADDING),
)
cropped = image.crop(box)
target_height = round(cropped.height * TARGET_WIDTH / cropped.width)
# Premultiplied resize avoids dark/white halos on the transparent edge.
resized = cropped.convert('RGBa').resize((TARGET_WIDTH, target_height), Image.LANCZOS).convert('RGBA')
resized.save(OUTPUT, optimize=True)
print('crop box', box, '->', resized.size, hashlib.sha256(OUTPUT.read_bytes()).hexdigest().upper(), OUTPUT.stat().st_size)
