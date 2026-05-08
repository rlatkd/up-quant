from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "UPquant"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
