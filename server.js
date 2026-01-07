// server.js — version robuste, sans HEIC

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const sharp = require("sharp");

const app = express();

const BASE_DIR = __dirname;
const UPLOAD_DIR = path.join(BASE_DIR, "uploads");
const PUBLIC_DIR = path.join(BASE_DIR, "public");

const PYTHON_BIN = path.join(BASE_DIR, ".venv", "bin", "python3");
const PREDICT_SCRIPT = path.join(BASE_DIR, "predict.py");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.static(PUBLIC_DIR));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Multer avec FILTRAGE STRICT des formats
 */
const upload = multer({
  dest: UPLOAD_DIR,
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          "Format d’image non supporté. Utilise JPG, PNG ou WEBP."
        ),
        false
      );
    }
    cb(null, true);
  }
});

app.post("/analyze", upload.single("image"), async (req, res) => {
  console.log("▶ /analyze called");

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Aucune image reçue ou format non supporté"
      });
    }

    const inputPath = req.file.path;
    const outputPath = `${inputPath}.jpg`;

    console.log("▶ Preprocessing image");
    console.log("▶ Input:", inputPath);

    await sharp(inputPath)
      .resize(224, 224, { fit: "cover" })
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    fs.unlinkSync(inputPath);

    console.log("▶ Image ready:", outputPath);
    console.log("▶ Using python:", PYTHON_BIN);

    const py = spawn(PYTHON_BIN, [PREDICT_SCRIPT, outputPath]);

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", d => stdout += d.toString());
    py.stderr.on("data", d => stderr += d.toString());

    py.on("close", code => {
      fs.unlinkSync(outputPath);

      console.log("▶ Python exited with code:", code);

      if (code !== 0) {
        console.error("✖ Python stderr:", stderr);
        return res.status(500).json({ error: stderr });
      }

      try {
        const result = JSON.parse(stdout);
        res.json(result);
      } catch {
        res.status(500).json({ error: "Réponse modèle invalide" });
      }
    });

  } catch (err) {
    console.error("✖ Server error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 TyreCheck server running on http://0.0.0.0:${PORT}`);
});
