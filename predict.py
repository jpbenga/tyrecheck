# predict.py
import os
import sys
import json
import numpy as np
from pathlib import Path
from PIL import Image, UnidentifiedImageError

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "tyre_quality_model.keras"
LABELS_PATH = BASE_DIR / "labels.json"
IMG_SIZE = (224, 224)

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

def load_labels():
    with open(LABELS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [data[str(i)] for i in range(len(data))]

def preprocess(image_path: Path):
    if image_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported image format: {image_path.suffix}. "
            f"Supported formats: jpg, jpeg, png, webp."
        )

    try:
        img = Image.open(image_path).convert("RGB")
    except UnidentifiedImageError:
        raise ValueError("Cannot read image file. Invalid or corrupted image.")

    img = img.resize(IMG_SIZE)
    x = np.asarray(img, dtype=np.float32)
    x = np.expand_dims(x, axis=0)
    x = tf.keras.applications.efficientnet.preprocess_input(x)
    return x

def main():
    try:
        if len(sys.argv) < 2:
            raise ValueError("No image path provided")

        image_path = Path(sys.argv[1])

        if not image_path.exists():
            raise ValueError("Image file not found")

        if not MODEL_PATH.exists():
            raise ValueError("Model file not found")

        if not LABELS_PATH.exists():
            raise ValueError("labels.json not found")

        labels = load_labels()
        model = tf.keras.models.load_model(MODEL_PATH)

        x = preprocess(image_path)
        probs = model.predict(x, verbose=0)[0]

        idx = int(np.argmax(probs))
        result = {
            "class": labels[idx],
            "confidence": float(probs[idx]),
            "probs": {labels[i]: float(probs[i]) for i in range(len(labels))}
        }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({ "error": str(e) }))
        sys.exit(1)

if __name__ == "__main__":
    main()
