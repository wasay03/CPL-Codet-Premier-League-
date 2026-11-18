import io

from fastapi import HTTPException, UploadFile
from PIL import Image as PILImage
from PIL import ImageOps, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Image

MAX_BYTES = 1024 * 1024
MAX_SIDE = 512
ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/gif"}


async def store_upload(session: AsyncSession, file: UploadFile) -> Image:
    """Validate, resize and re-encode an uploaded image, then store it as bytea."""
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Upload a PNG, JPEG, WebP or GIF image")
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Images must be 1 MB or smaller")
    try:
        img = PILImage.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "That file is not a readable image") from None

    img = ImageOps.exif_transpose(img)
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    if img.mode in ("RGBA", "LA", "P"):
        img.convert("RGBA").save(out, format="PNG", optimize=True)
        ctype = "image/png"
    else:
        img.convert("RGB").save(out, format="JPEG", quality=85, optimize=True)
        ctype = "image/jpeg"

    image = Image(content_type=ctype, data=out.getvalue())
    session.add(image)
    await session.flush()
    return image
