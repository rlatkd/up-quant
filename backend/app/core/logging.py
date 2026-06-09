import contextvars
import logging

# 요청 단위 상관관계 ID (MDC 역할). 인바운드 미들웨어에서 set, 모든 로그에 자동 주입.
request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.rid = request_id.get()
        return True


def setup_logging() -> None:
    """모든 로그를 단일 포맷(+rid)으로 일원화."""
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)-5s [%(name)s] (%(rid)s) %(message)s",
        datefmt="%H:%M:%S",
    ))
    handler.addFilter(_RequestIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    # uvicorn 로거는 기본적으로 '자체 핸들러'를 달고 동시에 root로 전파(propagate)하기도 해서,
    # 같은 메시지가 두 번 찍힌다(uvicorn 기본 포맷 + 우리 rid 포맷). 자체 핸들러를 비우고 root로만
    # 전파시켜 우리 단일 포맷으로 한 줄만 남긴다. (setup_logging은 uvicorn 로깅 구성 뒤 app import 시 실행됨)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "uvicorn.asgi"):
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.propagate = True

    # httpx 자체 요청 로그는 끔 (Upbit 로그는 [upbit]로 일원화)
    logging.getLogger("httpx").setLevel(logging.WARNING)
