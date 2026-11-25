package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"strconv"
	"time"

	_ "modernc.org/sqlite" // registers the "sqlite" driver
)

const schema = `
CREATE TABLE IF NOT EXISTS devices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,              -- e.g. "Library printer"
    token_hash TEXT NOT NULL UNIQUE,       -- SHA-256 of the device's secret token
    last_seen  TEXT                        -- for showing "online/offline" in the UI
);

CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   INTEGER NOT NULL REFERENCES devices(id),
    file        TEXT    NOT NULL,
    copies      INTEGER NOT NULL DEFAULT 1,
    status      TEXT    NOT NULL DEFAULT 'queued',  -- queued | printing | done | failed | cancelled
    error       TEXT,
    created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at  TEXT,
    finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_device_status ON jobs(device_id, status, id);
`

type Store struct{ db *sql.DB }

func OpenStore(path string) (*Store, error) {
	dsn := "file:" + path +
		"?_pragma=journal_mode(WAL)" + // readers don't block the writer
		"&_pragma=busy_timeout(5000)" + // wait up to 5 s instead of failing with "database is locked"
		"&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// ---------- devices ----------

type Device struct {
	ID   int64
	Name string
}

// HashToken returns the hex SHA-256 of a device token, the form stored in the database.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CreateDevice registers a new device and returns its ID and its secret token.
// Only the token's hash is stored, so the token cannot be shown again later.
func (s *Store) CreateDevice(ctx context.Context, name string) (int64, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return 0, "", err
	}
	token := hex.EncodeToString(b)
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO devices (name, token_hash) VALUES (?, ?)`, name, HashToken(token))
	if err != nil {
		return 0, "", err
	}
	id, err := res.LastInsertId()
	return id, token, err
}

func (s *Store) DeviceByTokenHash(ctx context.Context, hash string) (Device, error) {
	var d Device
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name FROM devices WHERE token_hash = ?`, hash,
	).Scan(&d.ID, &d.Name)
	return d, err
}

func (s *Store) DeviceExists(ctx context.Context, id int64) (bool, error) {
	var one int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM devices WHERE id = ?`, id).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// DeviceInfo is the public view of a device, safe to show to users.
type DeviceInfo struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Online bool   `json:"online"`
}

// ListDevices returns all devices. A device counts as online if it polled within onlineWindow.
func (s *Store) ListDevices(ctx context.Context, onlineWindow time.Duration) ([]DeviceInfo, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, COALESCE(last_seen >= datetime('now', ?), 0)
		FROM devices ORDER BY name, id`,
		"-"+strconv.FormatInt(int64(onlineWindow/time.Second), 10)+" seconds")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	devices := []DeviceInfo{} // empty list encodes as [] instead of null
	for rows.Next() {
		var d DeviceInfo
		if err := rows.Scan(&d.ID, &d.Name, &d.Online); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

func (s *Store) TouchDevice(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?`, id)
	return err
}

type Job struct {
	ID       int64
	DeviceID int64
	File     string
	Copies   int
	Status   string
	Error    string
}

func (s *Store) Enqueue(ctx context.Context, deviceID int64, file string, copies int) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO jobs (device_id, file, copies) VALUES (?, ?, ?)`, deviceID, file, copies)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// ClaimNext atomically takes the oldest queued job for a device and marks it as printing.
// Returns sql.ErrNoRows when the device has nothing queued.
func (s *Store) ClaimNext(ctx context.Context, deviceID int64) (Job, error) {
	j := Job{DeviceID: deviceID, Status: "printing"}
	err := s.db.QueryRowContext(ctx, `
		UPDATE jobs SET status = 'printing', claimed_at = CURRENT_TIMESTAMP
		WHERE id = (SELECT id FROM jobs
		            WHERE device_id = ? AND status = 'queued'
		            ORDER BY id LIMIT 1)
		RETURNING id, file, copies`, deviceID,
	).Scan(&j.ID, &j.File, &j.Copies)
	return j, err
}

// Finish records the result of a job. Only the device that claimed the job can finish it,
// and only while it is printing. Returns sql.ErrNoRows otherwise.
func (s *Store) Finish(ctx context.Context, jobID, deviceID int64, status, errMsg string) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE jobs SET status = ?, error = NULLIF(?, ''), finished_at = CURRENT_TIMESTAMP
		WHERE id = ? AND device_id = ? AND status = 'printing'`,
		status, errMsg, jobID, deviceID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) Get(ctx context.Context, id int64) (Job, error) {
	var j Job
	err := s.db.QueryRowContext(ctx, `
		SELECT id, device_id, file, copies, status, COALESCE(error, '')
		FROM jobs WHERE id = ?`, id,
	).Scan(&j.ID, &j.DeviceID, &j.File, &j.Copies, &j.Status, &j.Error)
	return j, err
}

// GetForDevice returns a job only if it belongs to the device and is currently being printed,
// so a device can download just the jobs it has claimed.
func (s *Store) GetForDevice(ctx context.Context, id, deviceID int64) (Job, error) {
	var j Job
	err := s.db.QueryRowContext(ctx, `
		SELECT id, device_id, file, copies, status, COALESCE(error, '')
		FROM jobs WHERE id = ? AND device_id = ? AND status = 'printing'`, id, deviceID,
	).Scan(&j.ID, &j.DeviceID, &j.File, &j.Copies, &j.Status, &j.Error)
	return j, err
}

// FailStale marks jobs that have been printing for longer than maxAge as failed
// (the device probably crashed or lost power). Returns how many jobs were affected.
func (s *Store) FailStale(ctx context.Context, maxAge time.Duration) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE jobs SET status = 'failed', error = 'device timeout',
		                finished_at = CURRENT_TIMESTAMP
		WHERE status = 'printing' AND claimed_at < datetime('now', ?)`,
		"-"+strconv.FormatInt(int64(maxAge/time.Second), 10)+" seconds")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
