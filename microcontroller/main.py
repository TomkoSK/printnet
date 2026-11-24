"""
    PRINTNET_SERVER         backend base URL, e.g. http://192.168.1.10:8080
    PRINTNET_TOKEN          device token printed by `go run . -add-device "<name>"`
    PRINTNET_POLL_INTERVAL  seconds between polls when idle (default 3)
"""

import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv()
SERVER = os.environ.get("PRINTNET_SERVER", "http://localhost:8080").rstrip("/")
TOKEN = os.environ["PRINTNET_TOKEN"]
POLL_INTERVAL = float(os.environ.get("PRINTNET_POLL_INTERVAL", "3"))


def request(method, path, body=None):
    headers = {"Authorization": f"Bearer {TOKEN}"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(SERVER + path, data=data, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=60)


def report(job_id, status, error=""):
    with request("POST", f"/device/jobs/{job_id}/status", {"status": status, "error": error}):
        pass


def handle(job):
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        with request("GET", job["file_url"]) as resp:
            shutil.copyfileobj(resp, tmp)  # streams to disk, no full copy in RAM
        tmp.flush()
        # lp returns once CUPS has accepted the job, so "done" means "handed to the printer queue"
        r = subprocess.run(["lp", "-n", str(job["copies"]), tmp.name], capture_output=True, text=True)
    if r.returncode:
        report(job["id"], "failed", r.stderr.strip()[:500])
        print(f"job {job['id']} failed: {r.stderr.strip()}", flush=True)
    else:
        report(job["id"], "done")
        print(f"job {job['id']} sent to printer: {r.stdout.strip()}", flush=True)


def main():
    print(f"polling {SERVER} every {POLL_INTERVAL:g} s", flush=True)
    while True:
        try:
            with request("GET", "/device/next-job") as resp:
                if resp.status == 204:  # nothing to print
                    time.sleep(POLL_INTERVAL)
                    continue
                job = json.load(resp)
        except (urllib.error.URLError, OSError, ValueError) as e:  # server down, no Wi-Fi, 401, bad JSON...
            print("poll failed:", e, flush=True)
            time.sleep(POLL_INTERVAL)
            continue

        try:
            handle(job)
        except Exception as e:
            print(f"job {job.get('id')} failed:", e, flush=True)
            try:
                report(job["id"], "failed", str(e)[:500])
            except Exception:
                pass


if __name__ == "__main__":
    main()
