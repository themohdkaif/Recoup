import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Dynamically resolve recoup.db relative to database.py location (portable across all machines and cwd)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = _BACKEND_DIR / "recoup.db"

_raw_db_url = os.getenv("DATABASE_URL")
if not _raw_db_url or any(_raw_db_url.endswith(p) for p in ["recoup.db", "recoup.sqlite", "recoup.sqlite3"]):
    DATABASE_URL = f"sqlite:///{_DEFAULT_DB_PATH.as_posix()}"
else:
    DATABASE_URL = _raw_db_url

connect_args = {"check_same_thread": False, "timeout": 30.0} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

# Enable WAL (Write-Ahead Logging) mode and busy timeout for SQLite to prevent locking
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
