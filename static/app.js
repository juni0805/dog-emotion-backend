const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const emotionEl = document.getElementById('emotion');
const confEl = document.getElementById('conf');
const warnEl = document.getElementById('warn');
const guideEl = document.getElementById('guideText');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const autoChk = document.getElementById('autoChk');

// 캡처/기록 UI
const shotBtn = document.getElementById('shotBtn');
const saveBtn = document.getElementById('saveBtn');
const captionInput = document.getElementById('captionInput');
const previewImg = document.getElementById('previewImg');
const previewMeta = document.getElementById('previewMeta');
const galleryEl = document.getElementById('gallery');

let stream = null;
let timer = null;

// 신뢰도 임계값(70% 아래면 경고)
const CONF_THRESHOLD = 0.7;

// ===== 감정 안정화 (최근 N개 다수결) =====
let hist = [];
const HIST_N = 5;

function stableEmotion(newEmotion) {
  hist.push(newEmotion);
  if (hist.length > HIST_N) hist.shift();

  const count = {};
  for (const e of hist) count[e] = (count[e] || 0) + 1;

  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}

// ===== 감정별 행동지침 =====
const ACTION_GUIDE = {
  alert:
    '👀 주변을 경계하고 있어요.\n조용한 환경을 만들어주고 무엇에 반응하는지 살펴보세요.',
  happy: '😊 기분이 좋아 보여요!\n칭찬해 주거나 가볍게 놀아주면 좋아요.',
  angry: '⚠️ 스트레스 상태일 수 있어요.\n자극을 줄이고 잠시 거리를 두세요.',
  frown: '😟 불안하거나 우울할 수 있어요.\n부드럽게 말을 걸어 안정감을 주세요.',
  relax: '😌 편안한 상태예요.\n현재 환경을 유지해 주세요.',
};

// ===== 감정 테마(색) =====
function setTheme(emotion) {
  document.body.classList.remove(
    'emotion-theme',
    'alert',
    'happy',
    'angry',
    'frown',
    'relax'
  );
  if (['alert', 'happy', 'angry', 'frown', 'relax'].includes(emotion)) {
    document.body.classList.add('emotion-theme', emotion);
  }
}

// ===== 웹캠 시작/중지 =====
async function startWebcam() {
  if (stream) return;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    video.srcObject = stream;

    startBtn.disabled = true;
    stopBtn.disabled = false;

    if (autoChk.checked) startAuto();
  } catch (err) {
    emotionEl.textContent = '카메라 권한 필요';
    confEl.textContent = '0%';
    warnEl.classList.add('hidden');
    guideEl.textContent = '-';
    alert('카메라 권한을 허용해야 합니다.');
  }
}

function stopWebcam() {
  stopAuto();

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  video.srcObject = null;
  hist = [];

  startBtn.disabled = false;
  stopBtn.disabled = true;

  emotionEl.textContent = '-';
  confEl.textContent = '0%';
  warnEl.classList.add('hidden');
  guideEl.textContent = '-';

  setTheme(''); // ✅ stopWebcam() 함수 안 맨 끝에서 테마 초기화
}

function startAuto() {
  stopAuto();
  timer = setInterval(captureAndPredict, 1000);
}

function stopAuto() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ===== 예측 요청 =====
async function captureAndPredict() {
  if (!stream) return;

  // 모델 입력용 224x224 캡처
  ctx.drawImage(video, 0, 0, 224, 224);
  const blob = await new Promise((res) =>
    canvas.toBlob(res, 'image/jpeg', 0.9)
  );

  const form = new FormData();
  form.append('file', blob, 'frame.jpg');

  try {
    const resp = await fetch('/predict', { method: 'POST', body: form });
    const data = await resp.json();

    const stable = stableEmotion(data.emotion ?? '-');
    emotionEl.textContent = stable;
    setTheme(stable);

    // confidence 처리
    const conf = typeof data.confidence === 'number' ? data.confidence : 0;

    // 표시용 퍼센트(100%로만 보이는 현상 완화)
    const pctRaw = conf * 100;
    const pct = Math.min(pctRaw, 99.9).toFixed(1);
    confEl.textContent = `${pct}%`;

    // 신뢰도 경고
    const low = conf < CONF_THRESHOLD;
    warnEl.classList.toggle('hidden', !low);

    // 행동지침 (신뢰도 낮으면 참고용 문구 추가)
    const guide = ACTION_GUIDE[stable] ?? '행동지침을 준비 중입니다.';
    guideEl.textContent = low ? `⚠️ 참고용 결과입니다.\n${guide}` : guide;
  } catch (e) {
    emotionEl.textContent = '서버 오류';
    confEl.textContent = '';
    warnEl.classList.add('hidden');
    guideEl.textContent = '-';
    setTheme('');
  }
}

// ===== 이벤트 연결 =====
startBtn.addEventListener('click', startWebcam);
stopBtn.addEventListener('click', stopWebcam);

autoChk.addEventListener('change', () => {
  if (!stream) return;
  autoChk.checked ? startAuto() : stopAuto();
});

// =========================
// 캡처/기록(로컬 저장) 기능
// =========================
let lastShot = null; // { dataUrl, emotion, conf, time }

function nowText() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function loadPosts() {
  try {
    return JSON.parse(localStorage.getItem('dog_posts') || '[]');
  } catch {
    return [];
  }
}

function savePosts(posts) {
  localStorage.setItem('dog_posts', JSON.stringify(posts));
}

function renderGallery() {
  const posts = loadPosts();
  galleryEl.innerHTML = '';

  if (posts.length === 0) {
    galleryEl.innerHTML = `<div style="opacity:.7;font-size:13px;">아직 기록이 없어요. 📸 스크린샷을 찍고 한 줄 기록을 남겨봐!</div>`;
    return;
  }

  for (const p of posts) {
    const card = document.createElement('div');
    card.className = 'card';

    const img = document.createElement('img');
    img.src = p.dataUrl;

    const meta = document.createElement('div');
    meta.className = 'meta';

    const top = document.createElement('div');
    top.className = 'top';
    top.textContent = `${p.time}  |  ${p.emotion}  |  ${p.conf}`;

    const cap = document.createElement('div');
    cap.className = 'caption';
    cap.textContent = p.caption || '(설명 없음)';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const dl = document.createElement('button');
    dl.className = 'smallBtn';
    dl.textContent = '다운로드';
    dl.onclick = () => {
      const a = document.createElement('a');
      a.href = p.dataUrl;
      a.download = `dog_${p.time.replace(/[: ]/g, '_')}.jpg`;
      a.click();
    };

    const del = document.createElement('button');
    del.className = 'smallBtn';
    del.textContent = '삭제';
    del.onclick = () => {
      const posts2 = loadPosts().filter((x) => x.id !== p.id);
      savePosts(posts2);
      renderGallery();
    };

    actions.appendChild(dl);
    actions.appendChild(del);

    meta.appendChild(top);
    meta.appendChild(cap);
    meta.appendChild(actions);

    card.appendChild(img);
    card.appendChild(meta);

    galleryEl.appendChild(card);
  }
}

function takeScreenshot() {
  if (!stream) {
    alert('웹캠을 먼저 시작해줘!');
    return;
  }

  // 16:9 스크린샷(고화질)
  const w = 960,
    h = 540;
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tctx = temp.getContext('2d');
  tctx.drawImage(video, 0, 0, w, h);

  const dataUrl = temp.toDataURL('image/jpeg', 0.92);

  const emotion = emotionEl.textContent || '-';
  const conf = confEl.textContent || '0%';
  const time = nowText();

  lastShot = { dataUrl, emotion, conf, time };

  previewImg.src = dataUrl;
  previewImg.style.display = 'block';
  previewMeta.textContent = `${time}\n감정: ${emotion}\n신뢰도: ${conf}\n\n설명을 입력하고 저장을 누르세요.`;

  saveBtn.disabled = false;
}

function saveScreenshotPost() {
  if (!lastShot) return;

  const caption = captionInput.value.trim();

  const post = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    dataUrl: lastShot.dataUrl,
    emotion: lastShot.emotion,
    conf: lastShot.conf,
    time: lastShot.time,
    caption,
  };

  const posts = loadPosts();
  posts.unshift(post);
  savePosts(posts);

  captionInput.value = '';
  saveBtn.disabled = true;
  previewMeta.textContent = '저장 완료 ✅ 아래 기록에서 확인하세요.';

  renderGallery();
}

shotBtn.addEventListener('click', takeScreenshot);
saveBtn.addEventListener('click', saveScreenshotPost);

// 최초 로딩 시 갤러리 렌더
renderGallery();
