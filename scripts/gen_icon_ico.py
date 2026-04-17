from PIL import Image

img = Image.open('/share/qserial/resources/icon.png').convert('RGBA')
w, h = img.size
s = min(w, h)
left = (w - s) // 2
top = (h - s) // 2
img = img.crop((left, top, left + s, top + s))

img.save(
    '/share/qserial/build/icon.ico',
    format='ICO',
    sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)]
)
print('ICO generated')
