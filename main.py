import os
import urllib.request

from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from PIL import Image
import io

# ===== 모델 파일 자동 다운로드 설정 =====
MODEL_PATH = "dog_emotion_model.pth"
MODEL_URL = "https://github.com/juni0805/dog-emotion-backend/releases/download/v1/dog_emotion_model.pth"

def ensure_model_file():
    # Render는 재배포/재시작 시 디스크가 초기화될 수 있어서
    # 모델 파일이 없으면 시작할 때마다 받아오게 해둔다.
    if not os.path.exists(MODEL_PATH):
        print("[startup] model file not found -> downloading...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("[startup] model downloaded:", MODEL_PATH)

# ⚠️ 중요: model.py import 전에 다운로드를 먼저 해야 함
ensure_model_file()

from model import predict  # model.py의 predict() 사용

app = FastAPI()

# /static 아래에 있는 파일들(HTML/JS/CSS) 제공
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return {"message": "server ok"}

# 웹캠 페이지
@app.get("/webcam")
def webcam_page():
    return FileResponse("static/index.html")

# 웹캠 프레임(이미지)을 받아서 예측
@app.post("/predict")
async def predict_emotion(file: UploadFile = File(...)):
    image_bytes = await file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return predict(image)
