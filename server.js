/**
 * TyreCheck - server.js (FULL FILE)
 * - Serves Angular production build (tyrecheck-pwa/dist/tyrecheck-pwa/browser)
 * - API:
 *    GET  /health
 *    POST /analyze   (multipart/form-data, field name: "image")
 * - Runs Python inference: predict.py <image_path>
 *
 * Node 20+ / Express 5 compatible (no app.get('*') PathError)
 */

const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");

const app = express();

// ---------- Paths ----------
const ROOT = __dirname;

// Angular build output (default)
const DEFAULT_DIST = path.join(
  ROOT,
  "tyrecheck-pwa",
  "dist",
  "tyrecheck-pwa",
  "browser"
);

// Allow override via env if needed
const DIST_DIR = process.env.ANGULAR_DIST
  ? path.resolve(process.env.ANGULAR_DIST)
  : DEFAULT_DIST;

const INDEX_HTML = path.join(DIST_DIR, "index.html");

const UPLOADS_DIR = path.join(ROOT, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Python executable: prefer repo .venv, else system python3
const VENV_PY = path.join(ROOT, ".venv", "bin", "python3");
const PYTHON_BIN = process.env.PYTHON_BIN
  ? process.env.PYTHON_BIN
  : fs.existsSync(VENV_PY)
  ? VENV_PY
  : "python3";

const PREDICT_PY = path.join(ROOT, "predict.py");

// ---------- Basic middleware ----------
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

// CORS (Option A: same origin, usually not needed; keep permissive for safety)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- Upload config ----------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    const name = `img_${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  // We accept common formats; HEIC/HEIF often breaks server-side decoding without extra libs.
  const mime = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  const isHeic = mime.includes("heic") || mime.includes("heif") || ext === ".heic" || ext === ".heif";
  if (isHeic) {
    return cb(
      new Error(
        "HEIC/HEIF not supported on server. Please use the camera capture button (JPEG) or upload a JPG/PNG/WebP."
      )
    );
  }

  const ok =
    mime.startsWith("image/") &&
    (mime.includes("jpeg") ||
      mime.includes("jpg") ||
      mime.includes("png") ||
      mime.includes("webp") ||
      mime.includes("bmp") ||
      mime.includes("gif"));

  if (!ok) {
    return cb(new Error("Unsupported file type. Please upload an image (JPG/PNG/WebP)."));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ---------- API ----------
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/analyze", upload.single("image"), async (req, res) => {
  console.log("▶ /analyze called");

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received. Field name must be 'image'." });
    }

    const imgPath = req.file.path;
    console.log("▶ Image saved:", imgPath);
    console.log("▶ Using python:", PYTHON_BIN);

    // Safety: ensure predict.py exists
    if (!fs.existsSync(PREDICT_PY)) {
      return res.status(500).json({ error: "predict.py not found on server." });
    }

    const out = await runPredict(imgPath);

    // Optional: cleanup upload
    try {
      fs.unlinkSync(imgPath);
    } catch (_) {}

    return res.json(out);
  } catch (err) {
    console.error("✖ Server error:", err?.message || err);
    return res.status(500).json({ error: "Internal Server Error", details: err?.message || String(err) });
  }
});

function runPredict(imgPath) {
  return new Promise((resolve, reject) => {
    const args = [PREDICT_PY, imgPath];

    const child = spawn(PYTHON_BIN, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `Python exited with code ${code}\n---- stderr ----\n${stderr}\n---- stdout ----\n${stdout}`
          )
        );
      }

      // predict.py prints JSON
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (e) {
        reject(
          new Error(
            `Could not parse JSON from predict.py.\n---- stdout ----\n${stdout}\n---- stderr ----\n${stderr}`
          )
        );
      }
    });

    child.on("error", (e) => reject(e));
  });
}

// ---------- Serve Angular (production build) ----------
if (!fs.existsSync(DIST_DIR)) {
  console.warn("⚠️ Angular dist not found:", DIST_DIR);
  console.warn("   Did you run: ng build --configuration production ?");
} else {
  console.log("✓ Serving Angular from:", DIST_DIR);
  app.use(express.static(DIST_DIR, { maxAge: "1h", index: false }));

  // IMPORTANT: Express 5 + path-to-regexp v6 => app.get('*') can break.
  // Use a regex fallback that excludes API routes.
  app.get(/^(?!\/(analyze|health)).*$/, (req, res) => {
    // If index.html missing, show a helpful message
    if (!fs.existsSync(INDEX_HTML)) {
      return res
        .status(500)
        .send("index.html not found. Build Angular first (ng build --configuration production).");
    }
    res.sendFile(INDEX_HTML);
  });
}

// ---------- Listen ----------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 TyreCheck server running on http://0.0.0.0:${PORT}`);
});

