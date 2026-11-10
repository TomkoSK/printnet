CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    credits       INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS print_jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    filename    TEXT NOT NULL,
    status      TEXT NOT NULL,             -- 'sent' or 'failed'
    printer_job TEXT NOT NULL DEFAULT '',  -- job id that CUPS gave us
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- test user until we have registration
INSERT OR IGNORE INTO users (id, first_name, last_name, email, password_hash)
VALUES (1, 'Test', 'User', 'test@printnet.local', '');
