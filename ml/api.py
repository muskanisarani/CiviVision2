import sys
from pathlib import Path

# Add src to path so imports work seamlessly
src_path = Path(__file__).parent / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from api import app, state, load_ml_resources, process_image_and_predict

if __name__ == "__main__":
    import uvicorn
    print("[*] Starting CiviVision ML Vision Server on http://127.0.0.1:8000 ...")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
