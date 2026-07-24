import fitz  # PyMuPDF
from PIL import Image
import os

INK_COLOR = (26, 30, 92)  # navy azul, similar al tinte original

def extract_signature(pdf_path, out_path, crop_box, bg_cut=235, ink_cut=160, target_width=500):
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    l, t, r, b = crop_box
    w, h = img.size
    img = img.crop((int(w*l), int(h*t), int(w*r), int(h*b)))

    gray = img.convert("L")
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    px_gray = gray.load()
    px_out = out.load()
    W, H = img.size
    for y in range(H):
        for x in range(W):
            v = px_gray[x, y]
            if v >= bg_cut:
                alpha = 0
            elif v <= ink_cut:
                alpha = 255
            else:
                # transición suave entre tinta e fondo
                alpha = int(255 * (bg_cut - v) / (bg_cut - ink_cut))
            if alpha > 0:
                px_out[x, y] = (INK_COLOR[0], INK_COLOR[1], INK_COLOR[2], alpha)

    bbox = out.getbbox()
    if bbox:
        pad = 6
        l2, t2, r2, b2 = bbox
        l2 = max(0, l2 - pad); t2 = max(0, t2 - pad)
        r2 = min(out.width, r2 + pad); b2 = min(out.height, b2 + pad)
        out = out.crop((l2, t2, r2, b2))

    scale = target_width / out.width
    out = out.resize((target_width, int(out.height * scale)), Image.LANCZOS)

    out.save(out_path)
    print(f"{out_path}: {out.size}")

os.makedirs("server/assets", exist_ok=True)
extract_signature(r"C:\Users\USUARIO\Downloads\Karim.pdf", "server/assets/firma_karim.png", crop_box=(0, 0.05, 0.80, 0.85))
extract_signature(r"C:\Users\USUARIO\Downloads\CPN SILVA.pdf", "server/assets/firma_silva.png", crop_box=(0, 0.05, 0.80, 0.85))
