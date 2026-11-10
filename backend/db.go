package main

import (
	"database/sql"
	_ "embed"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

var db *sql.DB

type Job struct {
	ID         int64  `json:"id"`
	Filename   string `json:"filename"`
	Status     string `json:"status"`
	PrinterJob string `json:"printerJob"`
	CreatedAt  string `json:"createdAt"`
}

func openDB(path string) error {
	var err error
	// foreign keys are off by default in sqlite
	db, err = sql.Open("sqlite", path+"?_pragma=foreign_keys(1)")
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1) // sqlite only does one write at a time anyway

	_, err = db.Exec(schema)
	return err
}

func saveJob(userID int64, filename, status, printerJob string) error {
	_, err := db.Exec(
		`INSERT INTO print_jobs (user_id, filename, status, printer_job) VALUES (?, ?, ?, ?)`,
		userID, filename, status, printerJob,
	)
	return err
}

func listJobs(userID int64) ([]Job, error) {
	rows, err := db.Query(
		`SELECT id, filename, status, printer_job, created_at FROM print_jobs
		 WHERE user_id = ? ORDER BY id DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	jobs := []Job{} // empty list instead of null in json
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.Filename, &j.Status, &j.PrinterJob, &j.CreatedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}
