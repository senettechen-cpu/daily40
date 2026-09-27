"""Converts GPT's ascension art (handoff-assets/ascension-20260921-gpt-v1/images)
into the WebP files the page loads. The PNG originals are never touched.

    python scripts/import-ascension-art.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'handoff-assets' / 'ascension-20260921-gpt-v1' / 'images'
TARGET = ROOT / 'public' / 'battle-assets' / 'ascension'

def convert(src: Path, dst: Path, size):
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as image:
        image = image.convert('RGB')
        image.thumbnail(size, Image.LANCZOS)
        image.save(dst, 'WEBP', quality=80, method=6)
    return dst

made = []
for png in sorted((SOURCE / 'organs').glob('*.png')):
    made.append(convert(png, TARGET / 'organs' / f'{png.stem}.webp', (320, 320)))
for png in sorted((SOURCE / 'stages').glob('*.png')):
    made.append(convert(png, TARGET / 'stages' / f'{png.stem}.webp', (960, 540)))
made.append(convert(SOURCE / 'apothecarion-background.png', TARGET / 'apothecarion-background.webp', (1280, 720)))

total = sum(p.stat().st_size for p in made)
print(f'{len(made)} files, {total // 1024} KB in {TARGET.relative_to(ROOT)}')
