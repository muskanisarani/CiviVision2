import io
import os
import json
import base64
from typing import Optional, List, Dict, Any
from pathlib import Path
from contextlib import asynccontextmanager
from PIL import Image

import torch
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

import sys
sys.path.insert(0, str(Path(__file__).parent))

from model import load_checkpoint, build_mobilenet_v3_large, get_transforms, get_device

DEFAULT_CONFIDENCE_THRESHOLD = 0.70
CLASSES_FILE = Path(__file__).parent.parent / "models" / "classes.json"
MODEL_FILE = Path(__file__).parent.parent / "models" / "civivision_model.pth"

class AppState:
    def __init__(self):
        self.model = None
        self.device = None
        self.classes: List[str] = [
            "Drainage_Sewerage", "Garbage_Waste", "Non_Civic",
            "Public_Toilet_Issue", "Road_Damage", "Streetlights", "Water_Issue"
        ]
        self.display_names: Dict[str, str] = {
            "Drainage_Sewerage": "Drainage & Sewerage",
            "Garbage_Waste": "Garbage / Waste",
            "Non_Civic": "Non-Civic / Invalid",
            "Public_Toilet_Issue": "Public Toilet Issue",
            "Road_Damage": "Road Damage",
            "Streetlights": "Streetlights",
            "Water_Issue": "Water Issue"
        }
        self.model_version: str = "civivision-cv-v1"

state = AppState()


def load_ml_resources() -> None:
    """Loads classes configuration and trained model weights into global state."""
    state.device = get_device()

    # Load classes
    if CLASSES_FILE.exists():
        try:
            with open(CLASSES_FILE, "r", encoding="utf-8") as f:
                class_info = json.load(f)
                state.classes = class_info.get("classes", state.classes)
                state.display_names = class_info.get("display_names", state.display_names)
        except Exception as e:
            print(f"[WARN] Failed to load classes.json: {e}")

    num_classes = len(state.classes)

    # Load model checkpoint
    if MODEL_FILE.exists():
        try:
            state.model, meta = load_checkpoint(str(MODEL_FILE), num_classes=num_classes, device=state.device)
            state.model_version = meta.get("model_version", "civivision-cv-v1")
            print(f"[*] Loaded trained model from {MODEL_FILE} on {state.device}")
        except Exception as e:
            print(f"[WARN] Failed to load checkpoint: {e}. Building fresh architecture fallback.")
            state.model = build_mobilenet_v3_large(num_classes=num_classes, pretrained=False).to(state.device)
            state.model.eval()
    else:
        print(f"[*] Checkpoint not found at {MODEL_FILE}. Building fresh architecture fallback.")
        state.model = build_mobilenet_v3_large(num_classes=num_classes, pretrained=False).to(state.device)
        state.model.eval()


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_ml_resources()
    yield


app = FastAPI(
    title="CiviVision Machine Learning Vision API",
    description="FastAPI service for civic defect classification using MobileNetV3-Large",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def process_image_and_predict(image_bytes: bytes, threshold: float = DEFAULT_CONFIDENCE_THRESHOLD) -> Dict[str, Any]:
    """Helper that runs inference on raw image bytes."""
    if state.model is None:
        load_ml_resources()

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid or corrupted image data. Could not decode: {str(e)}"
        )

    try:
        transform = get_transforms(is_training=False)
        tensor = transform(image).unsqueeze(0).to(state.device)
        tensor_flipped = transform(image.transpose(Image.FLIP_LEFT_RIGHT)).unsqueeze(0).to(state.device)

        with torch.no_grad():
            out1 = state.model(tensor)
            out2 = state.model(tensor_flipped)
            avg_outputs = (out1 + out2) / 2.0
            probs = torch.softmax(avg_outputs, dim=1).squeeze(0).cpu().numpy()

        sorted_indices = probs.argsort()[::-1]
        top_class_idx = int(sorted_indices[0])
        top_class_raw = state.classes[top_class_idx]
        top_confidence = float(probs[top_class_idx])
        second_confidence = float(probs[sorted_indices[1]]) if len(sorted_indices) > 1 else 0.0
        margin = round(top_confidence - second_confidence, 4)

        top_predictions = []
        for idx in sorted_indices[:3]:
            raw_name = state.classes[int(idx)]
            top_predictions.append({
                "category": state.display_names.get(raw_name, raw_name.replace("_", " ")),
                "raw_class": raw_name,
                "confidence": round(float(probs[int(idx)]), 4)
            })

        is_non_civic = top_class_raw == "Non_Civic"
        is_ambiguous = (top_confidence < threshold) or (margin < 0.15)
        needs_review = is_ambiguous or is_non_civic

        return {
            "success": True,
            "is_civic_issue": not is_non_civic,
            "category": state.display_names.get(top_class_raw, top_class_raw.replace("_", " ")),
            "raw_category": top_class_raw,
            "confidence": round(top_confidence, 4),
            "second_confidence": round(second_confidence, 4),
            "margin": margin,
            "is_ambiguous": bool(is_ambiguous),
            "severity": None,
            "top_predictions": top_predictions,
            "needs_review": bool(needs_review),
            "model_version": state.model_version
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


class PredictJsonRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded image string or data URL")
    threshold: Optional[float] = Field(DEFAULT_CONFIDENCE_THRESHOLD, description="Confidence threshold")


@app.get("/")
def root():
    return {
        "service": "CiviVision-ML-Service",
        "status": "online",
        "docs_url": "/docs",
        "version": state.model_version
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CiviVision-ML-Service",
        "classes": state.classes,
        "model_loaded": state.model is not None,
        "device": str(state.device),
        "model_version": state.model_version
    }


@app.post("/predict")
async def predict_multipart(
    file: UploadFile = File(...),
    threshold: float = Form(DEFAULT_CONFIDENCE_THRESHOLD)
):
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {str(e)}")

    if not content:
        raise HTTPException(status_code=400, detail="Empty image file provided.")

    return process_image_and_predict(content, threshold=threshold)


@app.post("/predict-json")
async def predict_json(request: PredictJsonRequest):
    b64_str = request.image
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(b64_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 encoding: {str(e)}")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image data decoded.")

    return process_image_and_predict(image_bytes, threshold=request.threshold or DEFAULT_CONFIDENCE_THRESHOLD)


if __name__ == "__main__":
    print(f"[*] Starting CiviVision ML Vision Server on http://127.0.0.1:8000 ...")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
