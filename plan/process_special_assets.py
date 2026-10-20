"""Download the approved v10 audio/art references and prepare local browser assets."""

from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
import colorsys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / "frontend" / "public"

AUDIO = {
    "genkidama-charge.mp3": "https://customer-assets-v7afamib.emergentagent.net/job_play-live-5/artifacts/ebded14c788fc408_Dragon%20Ball%20Z%20-%20Genkidama%20Sound%20Efect%28MP3_160K%29.mp3",
    "genkidama-impact.mp3": "https://customer-assets-v7afamib.emergentagent.net/job_play-live-5/artifacts/70edb5cf8e70b716_SOM%20DE%20EXPLOS%C3%83O%28MP3_160K%29.mp3",
    "lula-special-alt.mp3": "https://customer-assets-v7afamib.emergentagent.net/job_play-live-5/artifacts/697c55f78db24b41_km_20261020-1_720p_30f_20261020_164716%20%28online-audio-converter.com%29.mp3",
    "flavio-special.mp3": "https://customer-assets-v7afamib.emergentagent.net/job_play-live-5/artifacts/92a72fb2d0c8f37e_km_20261020_720p_30f_20261020_162826%20%28online-audio-converter.com%29.mp3",
}

GENKIDAMA_SOURCE = "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/7867806b40d9a0a7f71cf01b78724cc13d92120f5a7a801b29d50b16361999b1.jpeg"
LULA_GENKIDAMA_SOURCE = "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/bbbb85fe0400f7aa2304ff878fc2a1e8f2620e695075bb517725a9a769164b19.jpeg"
FLAVIO_GENKIDAMA_SOURCE = "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/91575fbafbf52a327d9ab472ce05929b36600a43440f596d1e147b41e6227909.jpeg"
JUSTICE_SOURCE = "https://customer-assets-v7afamib.emergentagent.net/job_play-live-5/artifacts/1b852e4f815b813d_images%20%283%29.jpeg"
XANDE_SOURCES = [
    "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/db79474265ff623ac61a4c032a73b1ee038c5af00935093058fc5bc834ce3692.jpeg",
    "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/dc558d7d9ac698286bc828c4195e2fa276aca6a753188a12df60a68b07f1751e.jpeg",
    "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/ab5011db6a574e23d5c6129dc006b844613394391a5627b635c28e16626f4d42.jpeg",
    "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/ad9d638817e56dbcd34fb5e6f49c47f62bd1886d3e43573e25ee1a5451e5d49f.jpeg",
    "https://static.prod-images.emergentagent.com/jobs/0c884798-ceeb-40dc-858f-c0cf11092d85/images/bda5dcf30dfe69d5d41f482382f4dc8d6d283c5b7bd1c53204259d6c733d0508.jpeg",
]


def download(url: str) -> bytes:
    with urlopen(url, timeout=45) as response:
        return response.read()


def chroma_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, _ in rgba.getdata():
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        # Match only the high-saturation magenta key; the previous broad RGB test also removed skin highlights.
        magenta = 0.78 <= hue <= 0.96 and saturation > 0.46 and value > 0.44 and red > 115 and blue > 95
        pixels.append((red, green, blue, 0 if magenta else 255))
    rgba.putdata(pixels)
    return rgba


def normalised_sheet(source: bytes, columns: int, rows: int, frames: int, cell_w: int, cell_h: int) -> Image.Image:
    keyed = chroma_key(Image.open(BytesIO(source)))
    source_w, source_h = keyed.size
    sheet = Image.new("RGBA", (cell_w * frames, cell_h), (0, 0, 0, 0))
    for index in range(frames):
        row, column = divmod(index, columns)
        left = round(column * source_w / columns)
        top = round(row * source_h / rows)
        right = round((column + 1) * source_w / columns)
        bottom = round((row + 1) * source_h / rows)
        frame = keyed.crop((left, top, right, bottom))
        alpha_box = frame.getchannel("A").getbbox()
        if alpha_box:
            frame = frame.crop(alpha_box)
        frame.thumbnail((cell_w - 12, cell_h - 10), Image.Resampling.NEAREST)
        x = index * cell_w + (cell_w - frame.width) // 2
        y = cell_h - frame.height
        sheet.alpha_composite(frame, (x, y))
    return sheet


def single_sprite_sheet(sources: list[str], cell_w: int, cell_h: int) -> Image.Image:
    sheet = Image.new("RGBA", (cell_w * len(sources), cell_h), (0, 0, 0, 0))
    for index, url in enumerate(sources):
        frame = chroma_key(Image.open(BytesIO(download(url))))
        alpha_box = frame.getchannel("A").getbbox()
        if alpha_box:
            frame = frame.crop(alpha_box)
        frame.thumbnail((cell_w - 10, cell_h - 8), Image.Resampling.NEAREST)
        x = index * cell_w + (cell_w - frame.width) // 2
        y = cell_h - frame.height
        sheet.alpha_composite(frame, (x, y))
    return sheet


def normalise_skin(sheet: Image.Image, fighter: str) -> Image.Image:
    palettes = {
        "lula": [(105, 67, 53), (177, 113, 84), (217, 148, 108), (238, 171, 128)],
        "flavio": [(103, 68, 49), (174, 116, 82), (211, 145, 103), (235, 173, 124)],
    }
    palette = palettes[fighter]
    corrected = []
    for red, green, blue, alpha in sheet.convert("RGBA").getdata():
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        skin = alpha > 0 and (hue <= 0.095 or hue >= 0.985) and 0.14 <= saturation <= 0.64 and value > 0.24
        if skin:
            shade = 0 if value < 0.46 else 1 if value < 0.68 else 2 if value < 0.86 else 3
            red, green, blue = palette[shade]
        corrected.append((red, green, blue, alpha))
    sheet.putdata(corrected)
    return sheet


def justice_backdrop(source: bytes) -> Image.Image:
    image = Image.open(BytesIO(source)).convert("RGBA")
    # The supplied reference has a stock-caption strip below the icon; only the approved artwork is used.
    image = image.crop((0, 0, image.width, round(image.height * 0.82)))
    cleaned = []
    for red, green, blue, _ in image.getdata():
        neutral_light = min(red, green, blue) > 178 and max(red, green, blue) - min(red, green, blue) < 34
        cleaned.append((red, green, blue, 0 if neutral_light else 255))
    image.putdata(cleaned)
    return image


def main() -> None:
    audio_dir = ROOT / "audio"
    sprite_dir = ROOT / "sprites"
    audio_dir.mkdir(parents=True, exist_ok=True)
    sprite_dir.mkdir(parents=True, exist_ok=True)
    for filename, url in AUDIO.items():
        (audio_dir / filename).write_bytes(download(url))
    single_sprite_sheet(XANDE_SOURCES, cell_w=256, cell_h=320).save(sprite_dir / "invocador_hammer_sheet.png")
    normalised_sheet(download(GENKIDAMA_SOURCE), columns=4, rows=1, frames=4, cell_w=320, cell_h=320).save(sprite_dir / "genkidama_fx_sheet.png")
    normalise_skin(normalised_sheet(download(LULA_GENKIDAMA_SOURCE), columns=3, rows=1, frames=3, cell_w=256, cell_h=320), "lula").save(sprite_dir / "lula_genkidama_sheet.png")
    normalise_skin(normalised_sheet(download(FLAVIO_GENKIDAMA_SOURCE), columns=3, rows=1, frames=3, cell_w=256, cell_h=320), "flavio").save(sprite_dir / "flavio_genkidama_sheet.png")
    justice_backdrop(download(JUSTICE_SOURCE)).save(sprite_dir / "hammer_justice_backdrop.png")


if __name__ == "__main__":
    main()