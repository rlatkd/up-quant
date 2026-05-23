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

    # httpx 자체 요청 로그는 끔 (Upbit 로그는 [upbit]로 일원화)
    logging.getLogger("httpx").setLevel(logging.WARNING)
