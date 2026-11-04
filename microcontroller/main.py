import os, subprocess, tempfile
from flask import Flask, request, abort, jsonify

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024   # 20 MB
TOKEN = "test"
ALLOWED = {".pdf", ".txt", ".png", ".jpg"}

@app.post("/print")
def print_doc():
    if request.headers.get("Authorization") != f"Bearer {TOKEN}":
        abort(401)
    f = request.files.get("file")
    if not f:
        abort(400)
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED:
        abort(415)
    with tempfile.NamedTemporaryFile(suffix=ext) as tmp:
        f.save(tmp.name)
        r = subprocess.run(["lp", tmp.name], capture_output=True, text=True)
    if r.returncode:
        return jsonify(error=r.stderr), 500
    return jsonify(job=r.stdout.strip())