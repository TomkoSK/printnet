package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

var (
	port         = env("PORT", "8080")
	printerURL   = env("PRINTER_URL", "http://raspberrypi.local:5000/print")
	printerToken = env("PRINTER_TOKEN", "test")
	soffice      = env("SOFFICE", "soffice") // libreoffice, used for converting to pdf
	dbPath       = env("DB_PATH", "printnet.db")
)

// no login yet, so every job belongs to the test user from schema.sql
const testUserID = 1

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	if err := openDB(dbPath); err != nil {
		log.Fatal("db: ", err)
	}

	http.HandleFunc("POST /api/print", handlePrint)
	http.HandleFunc("GET /api/jobs", handleJobs)

	log.Println("listening on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, cors(http.DefaultServeMux)))
}

// frontend runs on a different port so we need this
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handlePrint(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 20<<20) // 20 MB, same as the printer

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	name := filepath.Base(header.Filename)
	if name == "." || name == "/" || name == `\` {
		http.Error(w, "bad filename", http.StatusBadRequest)
		return
	}

	dir, err := os.MkdirTemp("", "printnet")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(dir)

	path := filepath.Join(dir, name)
	out, err := os.Create(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_, err = io.Copy(out, file)
	out.Close()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	pdf, err := toPDF(path, dir)
	if err != nil {
		log.Println("convert:", err)
		http.Error(w, "could not convert file to pdf", http.StatusUnprocessableEntity)
		return
	}

	res, err := sendToPrinter(pdf)
	if err != nil {
		log.Println("printer:", err)
		if err := saveJob(testUserID, name, "failed", ""); err != nil {
			log.Println("db:", err)
		}
		http.Error(w, "printer error", http.StatusBadGateway)
		return
	}

	// printer answers with {"job": "request id is ..."}
	var printed struct {
		Job string `json:"job"`
	}
	json.Unmarshal(res, &printed)

	// the file is already printing, so a db error shouldn't fail the request
	if err := saveJob(testUserID, name, "sent", printed.Job); err != nil {
		log.Println("db:", err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(res)
}

func handleJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := listJobs(testUserID)
	if err != nil {
		log.Println("db:", err)
		http.Error(w, "could not load jobs", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jobs)
}

func toPDF(path, dir string) (string, error) {
	if strings.ToLower(filepath.Ext(path)) == ".pdf" {
		return path, nil
	}

	outDir := filepath.Join(dir, "out")
	cmd := exec.Command(soffice, "--headless", "--convert-to", "pdf", "--outdir", outDir, path)
	if msg, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("%v: %s", err, msg)
	}

	base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	pdf := filepath.Join(outDir, base+".pdf")
	if _, err := os.Stat(pdf); err != nil {
		return "", fmt.Errorf("no output from libreoffice")
	}
	return pdf, nil
}

func sendToPrinter(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", filepath.Base(path))
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, f); err != nil {
		return nil, err
	}
	mw.Close()

	req, err := http.NewRequest("POST", printerURL, &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+printerToken)

	client := http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: %s", resp.Status, data)
	}
	return data, nil
}
