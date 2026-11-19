from fastapi import APIRouter, HTTPException, UploadFile

from ..auth import CurrentUserPwOk, SelfEditor, Session, hash_password, verify_password
from ..images import store_upload
from ..schemas import MeOut, MePatch, PasswordIn
from .auth import me_out
from .deps import Engine

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeOut)
async def get_me(user: CurrentUserPwOk) -> MeOut:
    return me_out(user)


@router.patch("/me", response_model=MeOut)
async def patch_me(body: MePatch, user: SelfEditor, session: Session, engine: Engine) -> MeOut:
    user = await session.merge(user)
    user.display_name = body.display_name.strip()
    await session.commit()
    await engine.notify_settings_changed()
    return me_out(user)


@router.post("/me/password", response_model=MeOut)
async def change_password(body: PasswordIn, user: SelfEditor, session: Session) -> MeOut:
    user = await session.merge(user)
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    if body.new_password == body.current_password:
        raise HTTPException(400, "Choose a different password")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    await session.commit()
    return me_out(user)


@router.post("/me/avatar", response_model=MeOut)
async def upload_avatar(file: UploadFile, user: SelfEditor, session: Session, engine: Engine) -> MeOut:
    user = await session.merge(user)
    image = await store_upload(session, file)
    user.avatar_image_id = image.id
    await session.commit()
    await engine.notify_settings_changed()
    return me_out(user)
