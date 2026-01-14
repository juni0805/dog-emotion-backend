import torch
import torch.nn as nn
import timm
from torchvision import transforms
from PIL import Image

# ⚠️ 클래스 순서: 학습 때 ImageFolder 폴더 정렬에 맞춰야 함
# 일단 알파벳순(대부분 이렇게 됨)으로 시작
CLASSES = ["alert", "angry", "frown", "happy", "relax"]

device = torch.device("cpu")

# ✅ timm EfficientNet-B0 (네 pth 키랑 맞는 구조)
model = timm.create_model("efficientnet_b0", pretrained=False, num_classes=5)
model.to(device)
model.eval()

def _load_checkpoint(path: str):
    ckpt = torch.load(path, map_location=device)

    # checkpoint가 dict로 감싸져 있을 수 있음
    if isinstance(ckpt, dict):
        for key in ["state_dict", "model", "model_state_dict", "net", "weights"]:
            if key in ckpt and isinstance(ckpt[key], dict):
                ckpt = ckpt[key]
                break

    # DataParallel로 저장된 경우 "module." 접두사 제거
    if isinstance(ckpt, dict):
        new_ckpt = {}
        for k, v in ckpt.items():
            if k.startswith("module."):
                k = k[len("module."):]
            new_ckpt[k] = v
        ckpt = new_ckpt

    return ckpt

state = _load_checkpoint("dog_emotion_model.pth")

# strict=False로 일부 키 차이가 있어도 최대한 로드
missing, unexpected = model.load_state_dict(state, strict=False)

# (옵션) 로드 상태 확인용 출력
print("✅ model loaded")
if missing:
    print("Missing keys (some ok):", missing[:5], "..." if len(missing) > 5 else "")
if unexpected:
    print("Unexpected keys (some ok):", unexpected[:5], "..." if len(unexpected) > 5 else "")

# 전처리 (EfficientNet 기본)
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    )
])

def predict(image: Image.Image):
    x = transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1)[0]
        conf, idx = torch.max(probs, dim=0)

    return {
        "emotion": CLASSES[int(idx.item())],
        "confidence": float(conf.item()),
    }
