from fastapi import APIRouter, HTTPException, Response

from ..auth import Session
from ..models import Image

router = APIRouter(tags=["images"])


@router.get("/images/{image_id}")
async def get_image(image_id: int, session: Session) -> Response:
    # Public on purpose: <img> tags cannot send a bearer token. Images are re-encoded uploads only.
    image = await session.get(Image, image_id)
    if not image:
        raise HTTPException(404, "Image not found")
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
