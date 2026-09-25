import os
import sys
import json
import argparse
from pathlib import Path
from PIL import Image
import torch

from model import load_checkpoint, get_transforms, get_device

DEFAULT_CONFIDENCE_THRESHOLD = 0.70
CLASSES_FILE = "ml/models/classes.json"
MODEL_FILE = "ml/models/civivision_model.pth"


def predict_image(
    image_path: str,
    model_path: str = MODEL_FILE,
    classes_path: str = CLASSES_FILE,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD
) -> dict:
    """
    Runs prediction on a single image file.
    """
    device = get_device()

    path_obj = Path(image_path)
    if path_obj.is_dir():
        valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
        found = [p for p in path_obj.iterdir() if p.is_file() and p.suffix.lower() in valid_exts]
        if found:
            print(f"[*] Folder provided. Automatically predicting first image: {found[0]}", file=sys.stderr)
            image_path = str(found[0])
            path_obj = Path(image_path)

    if not path_obj.exists():
        # Check if user passed a class folder or similar
        return {
            "success": False,
            "error": f"Image not found at '{image_path}'. Please provide a valid file path or directory (e.g. 'ml/dataset/test/Road_Damage')."
        }

    # Load classes
    if os.path.exists(classes_path):
        with open(classes_path, "r", encoding="utf-8") as f:
            class_info = json.load(f)
            classes = class_info.get("classes", [])
            display_names = class_info.get("display_names", {})
    else:
        classes = [
            "Garbage_Waste", "Road_Damage", "Water_Issue",
            "Streetlights", "Drainage_Sewerage", "Public_Toilet_Issue", "Non_Civic"
        ]
        display_names = {}

    num_classes = len(classes)

    # Load model
    if os.path.exists(model_path):
        try:
            model, metadata = load_checkpoint(model_path, num_classes=num_classes, device=device)
        except Exception as e:
            return {"success": False, "error": f"Failed to load model checkpoint: {str(e)}"}
    else:
        from model import build_mobilenet_v3_large
        model = build_mobilenet_v3_large(num_classes=num_classes, pretrained=False).to(device)
        model.eval()
        metadata = {"model_version": "civivision-cv-v1 (unweighted-initial)"}

    # Load and transform image (with Test-Time Augmentation)
    try:
        with Image.open(image_path) as img:
            rgb_image = img.convert("RGB")
        transform = get_transforms(is_training=False)
        tensor = transform(rgb_image).unsqueeze(0).to(device)
        tensor_flipped = transform(rgb_image.transpose(Image.FLIP_LEFT_RIGHT)).unsqueeze(0).to(device)
    except Exception as e:
        return {"success": False, "error": f"Failed to load image: {str(e)}"}

    # Inference with TTA (average original and horizontal flip)
    with torch.no_grad():
        out1 = model(tensor)
        out2 = model(tensor_flipped)
        avg_outputs = (out1 + out2) / 2.0
        probs = torch.softmax(avg_outputs, dim=1).squeeze(0).cpu().numpy()

    # Top predictions
    sorted_indices = probs.argsort()[::-1]
    top_class_idx = int(sorted_indices[0])
    top_class_raw = classes[top_class_idx]
    top_confidence = float(probs[top_class_idx])
    second_confidence = float(probs[sorted_indices[1]]) if len(sorted_indices) > 1 else 0.0
    margin = round(top_confidence - second_confidence, 4)

    top_predictions = []
    for idx in sorted_indices[:3]:
        raw_name = classes[int(idx)]
        top_predictions.append({
            "category": display_names.get(raw_name, raw_name.replace("_", " ")),
            "raw_class": raw_name,
            "confidence": round(float(probs[int(idx)]), 4)
        })

    is_non_civic = top_class_raw == "Non_Civic"
    is_civic_issue = not is_non_civic
    display_category = display_names.get(top_class_raw, top_class_raw.replace("_", " "))
    
    # Dual-trigger uncertainty: low absolute confidence OR narrow margin between top-1 and top-2
    is_ambiguous = (top_confidence < threshold) or (margin < 0.15)
    needs_review = is_ambiguous or is_non_civic

    result = {
        "success": True,
        "is_civic_issue": is_civic_issue,
        "category": display_category,
        "raw_category": top_class_raw,
        "confidence": round(top_confidence, 4),
        "second_confidence": round(second_confidence, 4),
        "margin": margin,
        "is_ambiguous": is_ambiguous,
        "severity": None,
        "top_predictions": top_predictions,
        "needs_review": needs_review,
        "model_version": metadata.get("model_version", "civivision-cv-v1")
    }

    if is_non_civic:
        result["rejection_reason"] = "No valid civic issue was detected in the uploaded image (classified as non-civic/irrelevant)."

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict civic issue for an image")
    parser.add_argument("image", type=str, help="Path to input image")
    parser.add_argument("--model", type=str, default=MODEL_FILE, help="Model checkpoint path")
    parser.add_argument("--threshold", type=float, default=DEFAULT_CONFIDENCE_THRESHOLD, help="Confidence threshold")
    args = parser.parse_args()

    res = predict_image(args.image, model_path=args.model, threshold=args.threshold)
    print(json.dumps(res, indent=2))
