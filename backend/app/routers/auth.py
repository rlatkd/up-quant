"""인증 — OAuth2 Password 플로우 + JWT(HttpOnly 쿠키). 로그인 브루트포스 제한 포함.

엔드포인트:
- POST /api/auth/token  : OAuth2 표준(form: username/password) → access/refresh 쿠키 설정 (/docs Authorize 연동)
- POST /api/auth/login  : token과 동일(프론트 명시적 호출용)
- POST /api/auth/refresh: refresh 쿠키 → 새 access 쿠키
- POST /api/auth/logout : 쿠키 삭제
- GET  /api/auth/me     : 현재 사용자(미인증 401)
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.core import ratelimit
from app.core.config import settings
from app.core.security import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    AuthError,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_ws_ticket,
    current_user,
    decode_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserOut(BaseModel):
    username: str


def _set_auth_cookies(response: Response, username: str) -> None:
    access = create_access_token(username)
    refresh = create_refresh_token(username)
    common = dict(httponly=True, secure=settings.cookie_secure, samesite="strict", path="/")
    response.set_cookie(ACCESS_COOKIE, access, max_age=settings.auth_access_ttl_min * 60, **common)
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=settings.auth_refresh_ttl_min * 60, **common)


def _do_login(form: OAuth2PasswordRequestForm, request: Request, response: Response) -> UserOut:
    ip = ratelimit.client_ip(request)
    locked = ratelimit.login_blocked(ip)
    if locked:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"로그인 시도가 많아 잠금되었습니다. {locked}초 후 다시 시도하세요.")
    if not authenticate_user(form.username, form.password):
        ratelimit.record_login_failure(ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다",
                            headers={"WWW-Authenticate": "Bearer"})
    ratelimit.record_login_success(ip)
    _set_auth_cookies(response, form.username)
    return UserOut(username=form.username)


@router.post("/token", response_model=UserOut)
def token(form: Annotated[OAuth2PasswordRequestForm, Depends()], request: Request, response: Response):
    """OAuth2 표준 토큰 엔드포인트(/docs Authorize 연동). 쿠키로 토큰을 내려준다."""
    return _do_login(form, request, response)


@router.post("/login", response_model=UserOut)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], request: Request, response: Response):
    return _do_login(form, request, response)


@router.post("/refresh", response_model=UserOut)
def refresh(request: Request, response: Response):
    rt = request.cookies.get(REFRESH_COOKIE)
    if not rt:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "리프레시 토큰 없음")
    try:
        username = decode_token(rt, "refresh")
    except AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    _set_auth_cookies(response, username)
    return UserOut(username=username)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: Annotated[str, Depends(current_user)]):
    return UserOut(username=user)


@router.get("/ws-ticket")
def ws_ticket(user: Annotated[str, Depends(current_user)]):
    """WebSocket 연결용 단기 티켓(60초). 쿠키 인증된 사용자만 발급받아 ws URL의 ?token=에 붙인다."""
    return {"ticket": create_ws_ticket(user)}
