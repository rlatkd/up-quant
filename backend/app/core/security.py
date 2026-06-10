"""인증/보안 코어 — FastAPI OAuth2(Bearer) + JWT(HS256) + bcrypt 비밀번호 해싱.

스프링 시큐리티 대응:
- SecurityFilterChain  ↔  보호 라우터의 Depends(get_current_user)
- JwtAuthenticationFilter ↔ 토큰을 HttpOnly 쿠키(우선) 또는 Authorization 헤더에서 읽어 decode
- PasswordEncoder(BCrypt) ↔ bcrypt.hashpw / checkpw
- UserDetailsService ↔ authenticate_user()

토큰은 XSS 탈취 방지를 위해 access/refresh JWT를 모두 HttpOnly+Secure+SameSite 쿠키로 보관한다
(localStorage 미사용). access는 짧게(기본 30분), refresh로 갱신한다.
"""
import time

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, WebSocket, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings

ALGORITHM = "HS256"
ACCESS_COOKIE = "uq_access"
REFRESH_COOKIE = "uq_refresh"

# /docs의 Authorize 버튼 연동용(헤더 Bearer). 실제 인증은 쿠키 우선이라 auto_error=False.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

# 하드코딩 단일 계정의 비밀번호를 부팅 시 bcrypt 해시로 만들어 둔다(평문 비교 안 함).
_PW_HASH = bcrypt.hashpw(settings.auth_password.encode(), bcrypt.gensalt())


class AuthError(Exception):
    """인증 실패(라우터가 401로 변환)."""


def verify_password(plain: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), _PW_HASH)
    except Exception:  # noqa: BLE001
        return False


def authenticate_user(username: str, password: str) -> bool:
    # 사용자명도 비밀번호도 일정 시간 비교(타이밍 공격 완화 — bcrypt가 상수시간 비교).
    return username == settings.auth_username and verify_password(password)


def _create_token(sub: str, ttl_min: int, typ: str) -> str:
    now = int(time.time())
    payload = {"sub": sub, "type": typ, "iat": now, "exp": now + ttl_min * 60}
    return jwt.encode(payload, settings.auth_secret, algorithm=ALGORITHM)


def create_access_token(sub: str) -> str:
    return _create_token(sub, settings.auth_access_ttl_min, "access")


def create_refresh_token(sub: str) -> str:
    return _create_token(sub, settings.auth_refresh_ttl_min, "refresh")


def create_ws_ticket(sub: str) -> str:
    # WS 전용 단기 티켓(60초). 브라우저가 WS 핸드셰이크에 쿠키를 안 보내는 경우가 있어, 프론트가
    # 쿠키 인증된 REST로 이 티켓을 받아 ws URL의 ?token=으로 붙인다. 짧고 WS에만 쓰여 노출 위험 최소.
    return _create_token(sub, 1, "ws")


def decode_token(token: str, expected_type: str) -> str:
    """검증 후 sub(사용자명) 반환. 만료·서명오류·타입불일치면 AuthError."""
    try:
        payload = jwt.decode(token, settings.auth_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise AuthError("토큰 만료") from e
    except jwt.InvalidTokenError as e:
        raise AuthError("토큰 무효") from e
    if payload.get("type") != expected_type:
        raise AuthError("토큰 타입 불일치")
    sub = payload.get("sub")
    if not sub:
        raise AuthError("토큰에 사용자 없음")
    return sub


def current_user(request: Request, header_token: str | None = Depends(oauth2_scheme)) -> str:
    """보호 라우터 의존성 — 쿠키(우선) 또는 Bearer 헤더의 access 토큰을 검증해 사용자명 반환.
    토큰이 없거나 무효/만료면 401. (라우터에 dependencies=[Depends(current_user)]로 일괄 적용)"""
    token = request.cookies.get(ACCESS_COOKIE) or header_token
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "인증이 필요합니다",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        return decode_token(token, "access")
    except AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e),
                            headers={"WWW-Authenticate": "Bearer"}) from e


def ws_authenticate(websocket: WebSocket) -> str | None:
    """WebSocket 인증 — ?token=의 WS 단기 티켓(권장) 또는 핸드셰이크 쿠키의 access 토큰을 검증.
    브라우저가 WS 핸드셰이크에 쿠키를 안 보내는 경우가 있어, 프론트는 쿠키 인증된 REST로 받은
    ws 티켓을 ?token=으로 붙인다. 둘 중 하나라도 유효하면 사용자명, 아니면 None(호출부가 close)."""
    qtoken = websocket.query_params.get("token")
    if qtoken:
        try:
            return decode_token(qtoken, "ws")
        except AuthError:
            pass
    ctoken = websocket.cookies.get(ACCESS_COOKIE)
    if ctoken:
        try:
            return decode_token(ctoken, "access")
        except AuthError:
            pass
    return None
