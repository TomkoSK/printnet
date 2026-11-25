package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	MaxUpload     = 20 << 20         // 20 MB
	StaleJobAfter = 10 * time.Minute // a job printing longer than this is marked failed
	OnlineWindow  = 30 * time.Second // a device that polled within this time is shown as online
)

type App struct {
	store     *Store
	uploadDir string
}

// ---------- user-facing endpoints ----------

// print accepts a PDF upload (form fields: file, device_id, copies) and queues it.
func (a *App) print(w http.ResponseWriter, req *http.Request) {
	req.Body = http.MaxBytesReader(w, req.Body, MaxUpload)

	file, _, err := req.FormFile("file")
	if err != nil {
		http.Error(w, "no file, or file too large", http.StatusBadRequest)
		return
	}
	defer file.Close()

	deviceID, err := strconv.ParseInt(req.FormValue("device_id"), 10, 64)
	if err != nil {
		http.Error(w, "missing or invalid device_id", http.StatusBadRequest)
		return
	}
	exists, err := a.store.DeviceExists(req.Context(), deviceID)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, "unknown device", http.StatusBadRequest)
		return
	}

	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	if http.DetectContentType(head[:n]) != "application/pdf" {
		http.Error(w, "only PDF files are accepted", http.StatusUnsupportedMediaType) //TODO: add .pdf converter
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	copies, err := strconv.Atoi(req.FormValue("copies"))
	if err != nil || copies < 1 || copies > 100 {
		copies = 1
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	path := filepath.Join(a.uploadDir, hex.EncodeToString(b)+".pdf")

	dst, err := os.Create(path)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if _, err := io.Copy(dst, file); err != nil {
		dst.Close()
		os.Remove(path)
		http.Error(w, "upload failed", http.StatusBadRequest)
		return
	}
	if err := dst.Close(); err != nil {
		os.Remove(path)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	id, err := a.store.Enqueue(req.Context(), deviceID, path, copies)
	if err != nil {
		os.Remove(path)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "status": "queued"})
}

// devices lists printers users can send jobs to. Tokens are never included.
func (a *App) devices(w http.ResponseWriter, req *http.Request) {
	devices, err := a.store.ListDevices(req.Context(), OnlineWindow)
	if err != nil {
		log.Println("list devices:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, devices)
}

func (a *App) jobInfo(w http.ResponseWriter, req *http.Request) {
	id, err := strconv.ParseInt(req.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, req)
		return
	}
	job, err := a.store.Get(req.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, req)
		return
	}
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":        job.ID,
		"device_id": job.DeviceID,
		"copies":    job.Copies,
		"status":    job.Status,
		"error":     job.Error,
	})
}

// ---------- device endpoints (polling) ----------

type deviceKey struct{}

func (a *App) deviceAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		dev, err := a.store.DeviceByTokenHash(r.Context(), HashToken(token))
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if err := a.store.TouchDevice(r.Context(), dev.ID); err != nil {
			log.Println("touch device:", err)
		}
		next(w, r.WithContext(context.WithValue(r.Context(), deviceKey{}, dev)))
	}
}

func deviceFrom(ctx context.Context) Device { return ctx.Value(deviceKey{}).(Device) }

// nextJob claims the device's oldest queued job. 204 = nothing to print.
func (a *App) nextJob(w http.ResponseWriter, r *http.Request) {
	dev := deviceFrom(r.Context())
	job, err := a.store.ClaimNext(r.Context(), dev.ID)
	if errors.Is(err, sql.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		log.Println("claim next:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":       job.ID,
		"copies":   job.Copies,
		"file_url": fmt.Sprintf("/device/jobs/%d/file", job.ID),
	})
}

// jobFile streams the PDF of a job the device has claimed.
func (a *App) jobFile(w http.ResponseWriter, r *http.Request) {
	dev := deviceFrom(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	job, err := a.store.GetForDevice(r.Context(), id, dev.ID)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	f, err := os.Open(job.File)
	if err != nil {
		http.Error(w, "file missing", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	http.ServeContent(w, r, "", st.ModTime(), f) // sets Content-Length, supports Range requests
}

// jobStatus lets the device report {"status": "done"} or {"status": "failed", "error": "..."}.
func (a *App) jobStatus(w http.ResponseWriter, r *http.Request) {
	dev := deviceFrom(r.Context())
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	var body struct {
		Status string `json:"status"`
		Error  string `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil ||
		(body.Status != "done" && body.Status != "failed") {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := a.store.Finish(r.Context(), id, dev.ID, body.Status, body.Error); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.NotFound(w, r)
			return
		}
		log.Println("finish job:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------- background ----------

// reaper marks jobs stuck in "printing" as failed, e.g. when a device lost power mid-job.
// They are not re-queued, so a half-printed job is never silently printed (and charged) twice.
func (a *App) reaper(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n, err := a.store.FailStale(ctx, StaleJobAfter)
			if err != nil {
				log.Println("reaper:", err)
			} else if n > 0 {
				log.Printf("reaper: marked %d stale job(s) as failed", n)
			}
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func main() {
	addr := flag.String("addr", ":8080", "address to listen on")
	dbPath := flag.String("db", "printnet.db", "SQLite database file")
	uploadDir := flag.String("uploads", "./upload", "directory for uploaded files")
	addDevice := flag.String("add-device", "", "register a new device with this name, print its token and exit")
	flag.Parse()

	store, err := OpenStore(*dbPath)
	if err != nil {
		log.Fatal("open database: ", err)
	}
	defer store.Close()

	if *addDevice != "" {
		id, token, err := store.CreateDevice(context.Background(), *addDevice)
		if err != nil {
			log.Fatal("create device: ", err)
		}
		fmt.Printf("device %d (%q) created\ntoken: %s\nSave the token now, it cannot be shown again.\n", id, *addDevice, token)
		return
	}

	if err := os.MkdirAll(*uploadDir, 0o755); err != nil {
		log.Fatal("create upload dir: ", err)
	}

	app := &App{store: store, uploadDir: *uploadDir}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /print", app.print) // TODO: user auth
	mux.HandleFunc("GET /jobs/{id}", app.jobInfo)
	mux.HandleFunc("GET /devices", app.devices)
	mux.HandleFunc("GET /device/next-job", app.deviceAuth(app.nextJob))
	mux.HandleFunc("GET /device/jobs/{id}/file", app.deviceAuth(app.jobFile))
	mux.HandleFunc("POST /device/jobs/{id}/status", app.deviceAuth(app.jobStatus))

	// Cancelled on Ctrl+C / SIGTERM, which stops the reaper and shuts the server down cleanly.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go app.reaper(ctx)

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Println("listening on", *addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
