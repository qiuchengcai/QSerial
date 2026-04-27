from PIL import Image
import os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

img = Image.open(os.path.join(base_dir, 'resources', 'icon.png')).convert('RGBA')
w, h = img.size
s = min(w, h)
left = (w - s) // 2
top = (h - s) // 2
img = img.crop((left, top, left + s, top + s))

img.save(
    os.path.join(base_dir, 'build', 'icon.ico'),
    format='ICO',
    sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)]
)
print('ICO generated')
