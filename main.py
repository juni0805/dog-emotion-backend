import os
import io
import urllib.request
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# 정적 파일 제공
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ===== 모델 파일 자동 다운로드 =====
MODEL_PATH = str(BASE_DIR / "dog_emotion_model.pth")
MODEL_URL = "https://github.com/juni0805/dog-emotion-backend/releases/download/v1/dog_emotion_model.pth"

_predict_fn = None  # 첫 요청에서만 로드

def ensure_model_file():
    if not os.path.exists(MODEL_PATH):
        print("[predict] model file not found -> downloading...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("[predict] model downloaded:", MODEL_PATH)

def get_predict_fn():
    """
    model.py가 import 시점에 torch.load를 해버리므로
    서버 부팅 때 import하지 않고, /predict 요청 때만 import한다.
    """
    global _predict_fn
    if _predict_fn is None:
        ensure_model_file()
        from model import predict  # 여기서 import (첫 요청 때)
        _predict_fn = predict
    return _predict_fn


@app.get("/")
def root():
    return {"message": "server ok"}

# 서버가 깨어났는지 빠르게 확인용
@app.get("/health")
def health():
    return {"ok": True}

@app.get("/webcam")
def webcam_page():
    return FileResponse(str(STATIC_DIR / "index.html"))

@app.post("/predict")
async def predict_emotion(file: UploadFile = File(...)):
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    predict = get_predict_fn()
    return predict(image)
