/**
 * SnapPass · Passport Photo Generator — FULLY FIXED v2.1
 */

"use strict";

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const state = {
  originalImageData: null,
  originalImage: null,
  processedCanvas: null,
  bgRemovedCanvas: null,
  _transparentCanvas: null,
  bgRemoved: false,
  quantity: 4,
  bgColor: '#ffffff',
  borderWidth: 2,
  borderColor: '#000000',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  imageOffsetX: 0,
  imageOffsetY: 0,
  imageZoom: 1,
  zoomLevel: 100,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  lastOffsetX: 0,
  lastOffsetY: 0,
};

/* ══════════════════════════════════════════════
   DOM REFERENCES
══════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

const els = {
  welcomeScreen: $('welcome-screen'),
  enterBtn: $('enter-btn'),
  app: $('app'),
  uploadSection: $('upload-section'),
  editorSection: $('editor-section'),
  dropZone: $('drop-zone'),
  fileInput: $('file-input'),
  previewCanvas: $('preview-canvas'),
  previewContainer: $('preview-container'),
  sheetCanvas: $('sheet-canvas'),
  sheetCountLabel: $('sheet-count-label'),
  removeBgBtn: $('remove-bg-btn'),
  restoreBgBtn: $('restore-bg-btn'),
  whiteBgBtn: $('white-bg-btn'),
  brightnessSlider: $('brightness-slider'),
  contrastSlider: $('contrast-slider'),
  saturationSlider: $('saturation-slider'),
  brightnessVal: $('brightness-val'),
  contrastVal: $('contrast-val'),
  saturationVal: $('saturation-val'),
  borderWidthInput: $('border-width'),
  borderWidthVal: $('border-width-val'),
  borderColorInput: $('border-color'),
  customBgColor: $('custom-bg-color'),
  bgColorSwatches: $('bg-color-swatches'),
  qtySelector: $('qty-selector'),
  downloadBtn: $('download-btn'),
  shareBtn: $('share-btn'),
  saveHistoryBtn: $('save-history-btn'),
  historyBtn: $('history-btn'),
  newPhotoBtn: $('new-photo-btn'),
  zoomInBtn: $('zoom-in-btn'),
  zoomOutBtn: $('zoom-out-btn'),
  zoomLevel: $('zoom-level'),
  loadingOverlay: $('loading-overlay'),
  loadingText: $('loading-text'),
  downloadModal: $('download-modal'),
  historyModal: $('history-modal'),
  historyList: $('history-list'),
  historyEmpty: $('history-empty'),
  clearHistoryBtn: $('clear-history-btn'),
  toast: $('toast'),
  toastText: $('toast-text'),
  toastIcon: $('toast-icon'),
  dragHint: $('drag-hint'),
};

/* ══════════════════════════════════════════════
   SOUND ENGINE
══════════════════════════════════════════════ */
const Audio = (() => {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };
  const playTone = (freq, duration, type = 'sine', volume = 0.08) => {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration);
    } catch (_) {}
  };
  return {
    click: () => playTone(800, 0.08, 'sine', 0.05),
    success: () => {
      playTone(523, 0.1, 'sine', 0.07);
      setTimeout(() => playTone(659, 0.1, 'sine', 0.07), 100);
      setTimeout(() => playTone(784, 0.15, 'sine', 0.07), 200);
    },
    upload: () => {
      playTone(440, 0.1, 'triangle', 0.06);
      setTimeout(() => playTone(554, 0.12, 'triangle', 0.06), 120);
    },
    download: () => {
      playTone(392, 0.08, 'sine', 0.06);
      setTimeout(() => playTone(523, 0.1, 'sine', 0.06), 90);
      setTimeout(() => playTone(659, 0.15, 'sine', 0.06), 180);
    },
    welcome: () => {
      [440, 494, 554, 659].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.2, 'sine', 0.04), i * 120)
      );
    },
    error: () => playTone(220, 0.3, 'square', 0.04),
  };
})();

/* ══════════════════════════════════════════════
   TOAST UTILITY
══════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  els.toastText.textContent = msg;
  els.toastIcon.textContent = icons[type] || '✓';
  els.toast.classList.remove('hidden');
  els.toast.querySelector('.toast-inner').classList.remove('toast-out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.querySelector('.toast-inner').classList.add('toast-out');
    setTimeout(() => els.toast.classList.add('hidden'), 300);
  }, 2500);
}

/* ══════════════════════════════════════════════
   MODAL UTILITY
══════════════════════════════════════════════ */
function openModal(modal) {
  modal.classList.remove('hidden');
  document.addEventListener('keydown', escClose);
}
function closeModal(modal) {
  modal.classList.add('hidden');
  document.removeEventListener('keydown', escClose);
}
function escClose(e) {
  if (e.key === 'Escape') {
    [els.downloadModal, els.historyModal].forEach(closeModal);
  }
}

/* ══════════════════════════════════════════════
   LOADING
══════════════════════════════════════════════ */
function showLoading(msg = 'Processing…') {
  els.loadingText.textContent = msg;
  els.loadingOverlay.classList.remove('hidden');
}
function hideLoading() {
  els.loadingOverlay.classList.add('hidden');
}

/* ══════════════════════════════════════════════
   FIX 1 & 2: WELCOME → FLOW (with proper refresh vs reopen detection)
   
   SESSION LOGIC:
   - sessionStorage flag = user is in same browser tab session (refresh counts)
   - localStorage user = returning user exists
   
   On refresh: sessionStorage persists → skip password screen
   On fresh open (new tab/close+reopen): sessionStorage cleared → show password
══════════════════════════════════════════════ */
els.enterBtn.addEventListener('click', async () => {
  // Disable button to prevent double-click during async check
  els.enterBtn.disabled = true;
  els.enterBtn.style.opacity = '0.6';

  // Check internet first
  const hasInternet = await checkInternetOnBegin();
  if (!hasInternet) {
    // Re-enable button so user can retry after fixing internet
    els.enterBtn.disabled = false;
    els.enterBtn.style.opacity = '';
    return;
  }

  // Internet OK — proceed
  els.enterBtn.disabled = false;
  els.enterBtn.style.opacity = '';
  Audio.welcome();

  let _user = null;
  try { _user = JSON.parse(localStorage.getItem('snappass_user')); } catch(_) {}

  if (_user) {
    // RETURNING USER → directly unlock app
    els.welcomeScreen.classList.add('fade-out');
    setTimeout(() => {
      els.welcomeScreen.style.display = 'none';
      if (window.unlockApp) window.unlockApp();
    }, 600);
  } else {
    // NEW USER → show intro scroll
    els.welcomeScreen.classList.add('fade-out');
    setTimeout(() => {
      els.welcomeScreen.style.display = 'none';
      const introScreen = $('intro-screen');
      if (introScreen) {
        introScreen.style.display = 'flex';
        introScreen.style.flexDirection = 'column';
        introScreen.style.opacity = '0';
        requestAnimationFrame(() => {
          introScreen.style.transition = 'opacity 0.5s ease';
          introScreen.style.opacity = '1';
        });
        initIntroScroll();
      }
    }, 600);
  }
});

/* ══════════════════════════════════════════════
   FIX 1: INTRO SCROLL SYSTEM — Fixed container height & scroll
══════════════════════════════════════════════ */
function initIntroScroll() {
  const introScreen = $('intro-screen');
  const scrollEl    = $('intro-scroll');
  const progressBar = $('intro-progress');
  const animatables = document.querySelectorAll('.intro-animate');
  const nextBtn     = $('intro-next-btn');

  // CRITICAL FIX: Ensure intro screen has correct height and overflow
  if (introScreen) {
    introScreen.style.position = 'fixed';
    introScreen.style.top = '0';
    introScreen.style.left = '0';
    introScreen.style.right = '0';
    introScreen.style.bottom = '0';
    introScreen.style.overflow = 'hidden'; // outer container NO scroll
    introScreen.style.display = 'flex';
    introScreen.style.flexDirection = 'column';
    introScreen.style.zIndex = '90';
  }

  // CRITICAL FIX: scrollEl must have proper height and overflow-y
  if (scrollEl) {
    scrollEl.style.flex = '1';
    scrollEl.style.overflowY = 'auto';
    scrollEl.style.overflowX = 'hidden';
    scrollEl.style.webkitOverflowScrolling = 'touch';
    scrollEl.style.position = 'relative';
    // Ensure no pointer-events blocking
    scrollEl.style.pointerEvents = 'auto';
  }

  // Scroll progress bar — passive listener, no blocking
  if (scrollEl && progressBar) {
    scrollEl.addEventListener('scroll', () => {
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      const pct = max > 0 ? (scrollEl.scrollTop / max) * 100 : 0;
      progressBar.style.width = pct + '%';
      checkAnimatables();
    }, { passive: true });
  }

  // FIX: IntersectionObserver with scrollEl as root (correct for nested scroll)
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, root: scrollEl });

  animatables.forEach(el => observer.observe(el));

  // Also force-trigger visible check via manual rect comparison
  function checkAnimatables() {
    if (!scrollEl) return;
    const containerRect = scrollEl.getBoundingClientRect();
    animatables.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < containerRect.bottom - 40) {
        el.classList.add('visible');
      }
    });
  }
  // Trigger immediately and after short delay to catch first section
  checkAnimatables();
  setTimeout(checkAnimatables, 150);
  setTimeout(checkAnimatables, 500);

  // "Get Started" button → show create account screen
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      Audio.click && Audio.click();
      const createScreen = $('create-account-screen');
      if (introScreen) {
        introScreen.style.opacity = '0';
        setTimeout(() => {
          introScreen.style.display = 'none';
          if (createScreen) {
            createScreen.style.display = 'flex';
            createScreen.style.flexDirection = 'column';
            createScreen.style.opacity = '0';
            requestAnimationFrame(() => {
              createScreen.style.transition = 'opacity 0.5s ease';
              createScreen.style.opacity = '1';
            });
          }
        }, 500);
      }
    });
  }
}

/* ══════════════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════════════ */
els.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.dropZone.classList.add('drag-over');
});
els.dropZone.addEventListener('dragleave', () => {
  els.dropZone.classList.remove('drag-over');
});
els.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (!file || !file.type.startsWith('image/')) { showToast('Please drop an image file', 'error'); return; }
  gateUpload(() => handleFile(file));
});

els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  gateUpload(() => {
    handleFile(file);
    setTimeout(() => { e.target.value = ''; }, 300);
  });
  // Always clear the input value after reading
  setTimeout(() => { e.target.value = ''; }, 400);
});

els.dropZone.addEventListener('click', (e) => {
  if (e.target.closest('label') || e.target.tagName === 'INPUT') return;
  gateUpload(() => els.fileInput.click());
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      Audio.upload();
      state.originalImage = img;
      state.bgRemoved = false;
      state.bgRemovedCanvas = null;
      state._transparentCanvas = null;
      state.imageOffsetX = 0;
      state.imageOffsetY = 0;
      state.imageZoom = 1;
      state.brightness = 100;
      state.contrast = 100;
      state.saturation = 100;

      els.brightnessSlider.value = 100; els.brightnessVal.textContent = '100';
      els.contrastSlider.value = 100;   els.contrastVal.textContent = '100';
      els.saturationSlider.value = 100; els.saturationVal.textContent = '100';

      state.processedCanvas = buildPassportCanvas(img);
      renderPreview();
      renderSheet();

      els.uploadSection.classList.add('hidden');
      els.editorSection.classList.remove('hidden');
      els.newPhotoBtn.classList.remove('hidden');
      showToast('Photo loaded! Ready to customize.', 'success');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

/* ══════════════════════════════════════════════
   PASSPORT CANVAS BUILDER
══════════════════════════════════════════════ */
const PASSPORT_W = 413;
const PASSPORT_H = 531;

function buildPassportCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = PASSPORT_W;
  canvas.height = PASSPORT_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, PASSPORT_W, PASSPORT_H);

  const targetAspect = PASSPORT_W / PASSPORT_H;
  const imgAspect = img.width / img.height;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (imgAspect > targetAspect) {
    sw = img.height * targetAspect;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetAspect;
    sy = 0;
  }

  const zoom = state.imageZoom;
  const ox = state.imageOffsetX;
  const oy = state.imageOffsetY;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(zoom, zoom);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PASSPORT_W / zoom, PASSPORT_H / zoom);
  ctx.restore();
  return canvas;
}

function applyFilters(src) {
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
  ctx.drawImage(src, 0, 0);
  return canvas;
}

function applyBorder(src) {
  if (state.borderWidth === 0) return src;
  const bw = state.borderWidth;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.strokeStyle = state.borderColor;
  ctx.lineWidth = bw * 2;
  ctx.strokeRect(0, 0, src.width, src.height);
  return canvas;
}

/* ══════════════════════════════════════════════
   RENDER PREVIEW
══════════════════════════════════════════════ */
function renderPreview() {
  if (!state.processedCanvas) return;
  const pCtx = els.previewCanvas.getContext('2d');
  const W = els.previewCanvas.width;
  const H = els.previewCanvas.height;
  let src = state.bgRemoved && state.bgRemovedCanvas
    ? state.bgRemovedCanvas
    : state.processedCanvas;
  const filtered = applyFilters(src);
  const bordered = applyBorder(filtered);
  pCtx.clearRect(0, 0, W, H);
  pCtx.drawImage(bordered, 0, 0, W, H);
  requestAnimationFrame(renderSheet);
}

/* ══════════════════════════════════════════════
   RENDER SHEET
══════════════════════════════════════════════ */
const A4_W   = 2480;
const A4_H   = 3508;
const MARGIN = 120;
const GAP    = 60;
const PHOTO_W = 413;
const PHOTO_H = 531;
const COLS_PER_SHEET = Math.floor((A4_W - MARGIN * 2 + GAP) / (PHOTO_W + GAP));
const ROWS_PER_SHEET = Math.floor((A4_H - MARGIN * 2 + GAP) / (PHOTO_H + GAP));
const PER_SHEET      = COLS_PER_SHEET * ROWS_PER_SHEET;

function buildSheetCanvas(bordered, startIdx, qty) {
  const canvas = document.createElement('canvas');
  canvas.width  = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4_W, A4_H);
  const onThisSheet = Math.min(qty, PER_SHEET);
  const cols = Math.min(onThisSheet, COLS_PER_SHEET);
  const rows = Math.ceil(onThisSheet / COLS_PER_SHEET);
  const gridW = cols * PHOTO_W + (cols - 1) * GAP;
  const gridH = rows * PHOTO_H + (rows - 1) * GAP;
  const startX = Math.floor((A4_W - gridW) / 2);
  const startY = Math.floor((A4_H - gridH) / 2);
  for (let i = 0; i < onThisSheet; i++) {
    const col = i % COLS_PER_SHEET;
    const row = Math.floor(i / COLS_PER_SHEET);
    const x   = startX + col * (PHOTO_W + GAP);
    const y   = startY + row * (PHOTO_H + GAP);
    ctx.shadowColor   = 'rgba(0,0,0,0.13)';
    ctx.shadowBlur    = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(bordered, x, y, PHOTO_W, PHOTO_H);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
  }
  return canvas;
}

let generatedSheets = [];
function renderSheet() {
  if (!state.processedCanvas) return;
  let src = state.bgRemoved && state.bgRemovedCanvas
    ? state.bgRemovedCanvas
    : state.processedCanvas;
  const filtered = applyFilters(src);
  const bordered  = applyBorder(filtered);
  const qty         = state.quantity;
  const numSheets   = Math.ceil(qty / PER_SHEET);
  generatedSheets   = [];
  for (let s = 0; s < numSheets; s++) {
    const remaining = qty - s * PER_SHEET;
    generatedSheets.push(buildSheetCanvas(bordered, s * PER_SHEET, remaining));
  }
  const previewSheet = generatedSheets[0];
  els.sheetCanvas.width  = previewSheet.width;
  els.sheetCanvas.height = previewSheet.height;
  const pCtx = els.sheetCanvas.getContext('2d');
  pCtx.drawImage(previewSheet, 0, 0);
  const sheetsLabel = numSheets > 1 ? ` · ${numSheets} sheets` : '';
  els.sheetCountLabel.textContent = `${qty} photo${qty > 1 ? 's' : ''}${sheetsLabel}`;
  let notice = document.getElementById('multi-sheet-notice');
  if (numSheets > 1) {
    if (!notice) {
      notice = document.createElement('p');
      notice.id = 'multi-sheet-notice';
      notice.className = 'text-center text-indigo-400 text-xs mt-3 font-medium';
      els.sheetCanvas.parentElement.appendChild(notice);
    }
    notice.textContent = `📄 ${numSheets} A4 sheets will be downloaded (photo size stays fixed at 35×45 mm)`;
  } else {
    if (notice) notice.remove();
  }
}

/* ══════════════════════════════════════════════
   BG REMOVAL
══════════════════════════════════════════════ */
async function removeBg() {
  if (!state.processedCanvas) {
    showToast('Please upload a photo first', 'error');
    return;
  }
  const apiKey = "kjKXAGPniMtZ2jLZqtxaARpS";
  showLoading('remove.bg AI removing background...');
  try {
    const blob = await canvasToBlob(state.processedCanvas);
    const formData = new FormData();
    formData.append('image_file', blob, 'photo.png');
    formData.append('size', 'auto');
    formData.append('type', 'auto');
    formData.append('format', 'png');
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('remove.bg Error:', errorText);
      if (response.status === 402) {
        showToast('remove.bg credits finished. Please recharge.', 'error');
      } else if (response.status === 429) {
        showToast('Too many requests. Try again after some time.', 'error');
      } else {
        showToast('remove.bg API error — using local fallback', 'error');
      }
      removeBgCanvas();
      hideLoading();
      return;
    }
    const resultBlob = await response.blob();
    const imageUrl = URL.createObjectURL(resultBlob);
    const img = new Image();
    img.onload = () => {
      const transparentCanvas = document.createElement('canvas');
      transparentCanvas.width = PASSPORT_W;
      transparentCanvas.height = PASSPORT_H;
      const tCtx = transparentCanvas.getContext('2d');
      tCtx.drawImage(img, 0, 0, PASSPORT_W, PASSPORT_H);
      state._transparentCanvas = transparentCanvas;
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = PASSPORT_W;
      finalCanvas.height = PASSPORT_H;
      const fCtx = finalCanvas.getContext('2d');
      fCtx.fillStyle = state.bgColor || '#ffffff';
      fCtx.fillRect(0, 0, PASSPORT_W, PASSPORT_H);
      fCtx.drawImage(transparentCanvas, 0, 0);
      state.bgRemovedCanvas = finalCanvas;
      state.bgRemoved = true;
      renderPreview();
      Audio.success();
      showToast('Background removed successfully! ✓', 'success');
      URL.revokeObjectURL(imageUrl);
      hideLoading();
    };
    img.onerror = () => {
      showToast('Failed to process image', 'error');
      hideLoading();
      removeBgCanvas();
    };
    img.src = imageUrl;
  } catch (err) {
    console.error('remove.bg failed:', err);
    showToast('remove.bg failed — using local removal', 'error');
    removeBgCanvas();
    hideLoading();
  }
}

function removeBgCanvas() {
  if (!state.processedCanvas) return;
  const src = state.processedCanvas;
  const W = src.width;
  const H = src.height;
  const workCanvas = document.createElement('canvas');
  workCanvas.width = W;
  workCanvas.height = H;
  const wCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  wCtx.fillStyle = '#ffffff';
  wCtx.fillRect(0, 0, W, H);
  wCtx.drawImage(src, 0, 0);
  const imageData = wCtx.getImageData(0, 0, W, H);
  const data = imageData.data;
  const samples = [];
  const samplePoints = [
    ...Array.from({length: 20}, (_, i) => [Math.floor(W * i/20), 5]),
    ...Array.from({length: 20}, (_, i) => [Math.floor(W * i/20), H-6]),
    ...Array.from({length: 15}, (_, i) => [5, Math.floor(H * i/15)]),
    ...Array.from({length: 15}, (_, i) => [W-6, Math.floor(H * i/15)]),
  ];
  samplePoints.forEach(([x, y]) => {
    const i = (y * W + x) * 4;
    samples.push([data[i], data[i+1], data[i+2]]);
  });
  let r = 0, g = 0, b = 0;
  samples.forEach(([rr, gg, bb]) => { r += rr; g += gg; b += bb; });
  r = Math.floor(r / samples.length);
  g = Math.floor(g / samples.length);
  b = Math.floor(b / samples.length);
  const bgColor = [r, g, b];
  const bgThreshold = 35;
  const softThreshold = 65;
  const alpha = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const pr = data[i], pg = data[i+1], pb = data[i+2];
      const dr = pr - bgColor[0];
      const dg = pg - bgColor[1];
      const db = pb - bgColor[2];
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      if (dist < bgThreshold) {
        alpha[y*W + x] = 0;
      } else if (dist < softThreshold) {
        const t = (dist - bgThreshold) / (softThreshold - bgThreshold);
        alpha[y*W + x] = Math.floor((1 - t * t) * 255);
      } else {
        alpha[y*W + x] = 255;
      }
    }
  }
  const finalAlpha = new Uint8ClampedArray(W * H);
  const radius = 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, count = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          sum += alpha[ny * W + nx];
          count++;
        }
      }
      finalAlpha[y*W + x] = Math.floor(sum / count);
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = finalAlpha[Math.floor(i/4)];
  }
  wCtx.putImageData(imageData, 0, 0);
  state._transparentCanvas = workCanvas;
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = W;
  resultCanvas.height = H;
  const rCtx = resultCanvas.getContext('2d');
  rCtx.fillStyle = state.bgColor || '#ffffff';
  rCtx.fillRect(0, 0, W, H);
  rCtx.drawImage(workCanvas, 0, 0);
  state.bgRemovedCanvas = resultCanvas;
  state.bgRemoved = true;
  renderPreview();
  Audio.success();
  showToast('Background removed successfully!', 'success');
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/* ══════════════════════════════════════════════
   EVENT HANDLERS · Controls
══════════════════════════════════════════════ */
els.removeBgBtn.addEventListener('click', () => {
  Audio.click();
  removeBg();
});

els.restoreBgBtn.addEventListener('click', () => {
  Audio.click();
  state.bgRemoved = false;
  state.bgRemovedCanvas = null;
  state._transparentCanvas = null;
  if (state.originalImage) {
    state.processedCanvas = buildPassportCanvas(state.originalImage);
  }
  renderPreview();
  showToast('Original background restored', 'info');
});

els.whiteBgBtn.addEventListener('click', () => {
  Audio.click();
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  const whiteSwatch = document.querySelector('.color-swatch[data-color="#ffffff"]');
  if (whiteSwatch) whiteSwatch.classList.add('active');
  if (els.customBgColor) els.customBgColor.value = '#ffffff';
  const hexEl = document.getElementById('custom-color-hex');
  if (hexEl) hexEl.textContent = '#ffffff';
  applyBgColorToPhoto('#ffffff');
  showToast('White background applied', 'success');
});

function applyBgColorToPhoto(color) {
  state.bgColor = color;
  if (state.bgRemoved && state._transparentCanvas) {
    const W = state._transparentCanvas.width;
    const H = state._transparentCanvas.height;
    const result = document.createElement('canvas');
    result.width  = W;
    result.height = H;
    const rCtx = result.getContext('2d');
    rCtx.fillStyle = color;
    rCtx.fillRect(0, 0, W, H);
    rCtx.drawImage(state._transparentCanvas, 0, 0);
    state.bgRemovedCanvas = result;
  } else if (state.originalImage) {
    state.processedCanvas = buildPassportCanvas(state.originalImage);
  }
  renderPreview();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.color-swatch[data-color]');
  if (!btn) return;
  Audio.click();
  const color = btn.dataset.color;
  state.bgColor = color;
  if (els.customBgColor) els.customBgColor.value = color.length === 7 ? color : '#ffffff';
  const hexEl = document.getElementById('custom-color-hex');
  if (hexEl) hexEl.textContent = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  applyBgColorToPhoto(color);
});

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.color-cat-tab[data-cat]');
  if (!tab) return;
  Audio.click();
  const cat = tab.dataset.cat;
  document.querySelectorAll('.color-cat-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.querySelectorAll('.color-cat-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('cat-' + cat);
  if (panel) panel.classList.remove('hidden');
});

els.customBgColor.addEventListener('input', (e) => {
  const color = e.target.value;
  state.bgColor = color;
  const hexEl = document.getElementById('custom-color-hex');
  if (hexEl) hexEl.textContent = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  applyBgColorToPhoto(color);
});

els.qtySelector.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-qty]');
  if (!btn) return;
  Audio.click();
  state.quantity = parseInt(btn.dataset.qty);
  document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSheet();
});

els.brightnessSlider.addEventListener('input', (e) => {
  state.brightness = parseInt(e.target.value);
  els.brightnessVal.textContent = state.brightness;
  renderPreview();
});
els.contrastSlider.addEventListener('input', (e) => {
  state.contrast = parseInt(e.target.value);
  els.contrastVal.textContent = state.contrast;
  renderPreview();
});
els.saturationSlider.addEventListener('input', (e) => {
  state.saturation = parseInt(e.target.value);
  els.saturationVal.textContent = state.saturation;
  renderPreview();
});
els.borderWidthInput.addEventListener('input', (e) => {
  state.borderWidth = parseInt(e.target.value);
  els.borderWidthVal.textContent = state.borderWidth;
  renderPreview();
});
els.borderColorInput.addEventListener('input', (e) => {
  state.borderColor = e.target.value;
  renderPreview();
});

/* ══════════════════════════════════════════════
   ZOOM
══════════════════════════════════════════════ */
els.zoomInBtn.addEventListener('click', () => {
  Audio.click();
  state.zoomLevel = Math.min(200, state.zoomLevel + 10);
  updatePreviewZoom();
});
els.zoomOutBtn.addEventListener('click', () => {
  Audio.click();
  state.zoomLevel = Math.max(50, state.zoomLevel - 10);
  updatePreviewZoom();
});
function updatePreviewZoom() {
  const scale = state.zoomLevel / 100;
  const w = Math.round(180 * scale);
  const h = Math.round(240 * scale);
  els.previewContainer.style.width = w + 'px';
  els.previewContainer.style.height = h + 'px';
  els.previewCanvas.style.width = w + 'px';
  els.previewCanvas.style.height = h + 'px';
  els.zoomLevel.textContent = state.zoomLevel + '%';
}

/* ══════════════════════════════════════════════
   DRAG TO REPOSITION
══════════════════════════════════════════════ */
els.previewCanvas.addEventListener('mousedown', (e) => {
  state.dragging = true;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.lastOffsetX = state.imageOffsetX;
  state.lastOffsetY = state.imageOffsetY;
  els.dragHint.classList.remove('hidden');
});
document.addEventListener('mousemove', (e) => {
  if (!state.dragging) return;
  const dx = (e.clientX - state.dragStartX) * (PASSPORT_W / 180);
  const dy = (e.clientY - state.dragStartY) * (PASSPORT_H / 240);
  state.imageOffsetX = state.lastOffsetX + dx;
  state.imageOffsetY = state.lastOffsetY + dy;
  if (state.originalImage) {
    state.processedCanvas = buildPassportCanvas(state.originalImage);
    if (state.bgRemoved) {
      state.bgRemovedCanvas = null;
      state.bgRemoved = false;
    }
    renderPreview();
  }
});
document.addEventListener('mouseup', () => {
  state.dragging = false;
  els.dragHint.classList.add('hidden');
});
els.previewCanvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  state.dragging = true;
  state.dragStartX = t.clientX;
  state.dragStartY = t.clientY;
  state.lastOffsetX = state.imageOffsetX;
  state.lastOffsetY = state.imageOffsetY;
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!state.dragging) return;
  const t = e.touches[0];
  const dx = (t.clientX - state.dragStartX) * (PASSPORT_W / 180);
  const dy = (t.clientY - state.dragStartY) * (PASSPORT_H / 240);
  state.imageOffsetX = state.lastOffsetX + dx;
  state.imageOffsetY = state.lastOffsetY + dy;
  if (state.originalImage) {
    state.processedCanvas = buildPassportCanvas(state.originalImage);
    renderPreview();
  }
}, { passive: true });
document.addEventListener('touchend', () => { state.dragging = false; });

/* ══════════════════════════════════════════════
   DOWNLOAD
══════════════════════════════════════════════ */
els.downloadBtn.addEventListener('click', () => {
  Audio.click();
  openModal(els.downloadModal);
});
els.downloadModal.querySelectorAll('.dl-format-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const fmt = btn.dataset.fmt;
    Audio.download();
    downloadSheet(fmt);
    closeModal(els.downloadModal);
  });
});
function downloadSheet(fmt) {
  renderSheet();
  const ts       = new Date().toISOString().slice(0, 10);
  const basename = `snappass-${ts}`;
  if (fmt === 'pdf') {
    downloadAsPDF(generatedSheets, basename);
    return;
  }
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  const mime    = mimeMap[fmt] || 'image/png';
  const quality = (fmt === 'jpg' || fmt === 'jpeg') ? 0.95 : undefined;
  generatedSheets.forEach((canvas, idx) => {
    const suffix   = generatedSheets.length > 1 ? `-sheet${idx + 1}` : '';
    const filename = `${basename}${suffix}.${fmt}`;
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, mime, quality);
  });
  const label = generatedSheets.length > 1
    ? `${generatedSheets.length} sheets downloaded as ${fmt.toUpperCase()}!`
    : `Downloaded as ${fmt.toUpperCase()}!`;
  showToast(label, 'success');
}
function downloadAsPDF(sheets, filename) {
  try {
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    sheets.forEach((canvas, idx) => {
      if (idx > 0) pdf.addPage();
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
    });
    pdf.save(`${filename}.pdf`);
    const label = sheets.length > 1
      ? `PDF downloaded (${sheets.length} pages)!`
      : 'Downloaded as PDF!';
    showToast(label, 'success');
  } catch (err) {
    console.error(err);
    showToast('PDF failed — try PNG instead', 'error');
  }
}

/* ══════════════════════════════════════════════
   SHARE
══════════════════════════════════════════════ */
els.shareBtn.addEventListener('click', async () => {
  Audio.click();
  if (!navigator.share) {
    showToast('Sharing not supported in this browser', 'error');
    return;
  }
  try {
    renderSheet();
    const blob = await canvasToBlob(generatedSheets[0] || els.sheetCanvas);
    const file = new File([blob], 'passport-photo.png', { type: 'image/png' });
    await navigator.share({ title: 'My Passport Photo', text: 'Generated with SnapPass', files: [file] });
    showToast('Shared successfully!', 'success');
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Share failed', 'error');
  }
});

/* ══════════════════════════════════════════════
   HISTORY SYSTEM
══════════════════════════════════════════════ */
const HISTORY_KEY = 'snappass_history';
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveToHistory() {
  if (!state.processedCanvas) return;
  Audio.click();
  const thumb = els.previewCanvas.toDataURL('image/jpeg', 0.6);
  const sheetData = els.sheetCanvas.toDataURL('image/jpeg', 0.7);
  const originalData = state.originalImage?.src || null;
  const entry = {
    id: Date.now(),
    date: new Date().toLocaleString(),
    thumb, sheetData, originalSrc: originalData,
    settings: {
      quantity: state.quantity, bgColor: state.bgColor,
      borderWidth: state.borderWidth, borderColor: state.borderColor,
      brightness: state.brightness, contrast: state.contrast,
      saturation: state.saturation, imageOffsetX: state.imageOffsetX, imageOffsetY: state.imageOffsetY,
    },
  };
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > 20) history.splice(20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  Audio.success();
  showToast('Saved to history!', 'success');
}
function renderHistoryList() {
  const history = loadHistory();
  if (history.length === 0) {
    els.historyList.innerHTML = '';
    els.historyEmpty.classList.remove('hidden');
    return;
  }
  els.historyEmpty.classList.add('hidden');
  els.historyList.innerHTML = history.map(entry => `
    <div class="history-item" data-id="${entry.id}">
      <img src="${entry.thumb}" alt="Photo" class="history-thumb" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-white/80 truncate">Passport Photo</p>
        <p class="text-xs text-white/40">${entry.date}</p>
        <p class="text-xs text-white/30 mt-0.5">${entry.settings.quantity} copies · bg: ${entry.settings.bgColor}</p>
      </div>
      <button class="delete-history-item text-white/20 hover:text-red-400 transition-colors text-lg px-2" data-id="${entry.id}">✕</button>
    </div>
  `).join('');
  els.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-history-item')) return;
      const id = parseInt(item.dataset.id);
      restoreFromHistory(id);
    });
  });
  els.historyList.querySelectorAll('.delete-history-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteHistoryEntry(id);
    });
  });
}
function restoreFromHistory(id) {
  const history = loadHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) return;
  closeModal(els.historyModal);
  showLoading('Restoring…');
  const s = entry.settings;
  state.quantity = s.quantity; state.bgColor = s.bgColor;
  state.borderWidth = s.borderWidth; state.borderColor = s.borderColor;
  state.brightness = s.brightness; state.contrast = s.contrast;
  state.saturation = s.saturation;
  state.imageOffsetX = s.imageOffsetX || 0; state.imageOffsetY = s.imageOffsetY || 0;
  els.brightnessSlider.value = s.brightness; els.brightnessVal.textContent = s.brightness;
  els.contrastSlider.value = s.contrast;     els.contrastVal.textContent = s.contrast;
  els.saturationSlider.value = s.saturation; els.saturationVal.textContent = s.saturation;
  els.borderWidthInput.value = s.borderWidth; els.borderWidthVal.textContent = s.borderWidth;
  els.borderColorInput.value = s.borderColor;
  els.customBgColor.value = s.bgColor;
  document.querySelectorAll('.qty-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.qty) === s.quantity);
  });
  if (entry.originalSrc) {
    const img = new Image();
    img.onload = () => {
      state.originalImage = img;
      state.processedCanvas = buildPassportCanvas(img);
      state.bgRemoved = false;
      state.bgRemovedCanvas = null;
      renderPreview();
      renderSheet();
      els.uploadSection.classList.add('hidden');
      els.editorSection.classList.remove('hidden');
      els.newPhotoBtn.classList.remove('hidden');
      hideLoading();
      showToast('History restored!', 'success');
      Audio.success();
    };
    img.src = entry.originalSrc;
  } else {
    hideLoading();
    showToast('History restored (original not available)', 'info');
  }
}
function deleteHistoryEntry(id) {
  Audio.click();
  const history = loadHistory().filter(e => e.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistoryList();
}
els.historyBtn.addEventListener('click', () => {
  Audio.click();
  renderHistoryList();
  openModal(els.historyModal);
});
els.saveHistoryBtn.addEventListener('click', saveToHistory);
els.clearHistoryBtn.addEventListener('click', () => {
  Audio.click();
  localStorage.removeItem(HISTORY_KEY);
  renderHistoryList();
  showToast('History cleared', 'info');
});

/* ══════════════════════════════════════════════
   NEW PHOTO
══════════════════════════════════════════════ */
els.newPhotoBtn.addEventListener('click', () => {
  Audio.click();
  state.originalImage = null;
  state.processedCanvas = null;
  state.bgRemovedCanvas = null;
  state.bgRemoved = false;
  state.imageOffsetX = 0;
  state.imageOffsetY = 0;
  state.zoomLevel = 100;
  els.fileInput.value = '';
  updatePreviewZoom();
  els.editorSection.classList.add('hidden');
  els.uploadSection.classList.remove('hidden');
  els.newPhotoBtn.classList.add('hidden');
});

/* ══════════════════════════════════════════════
   MODAL CLOSE
══════════════════════════════════════════════ */
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    Audio.click();
    [els.downloadModal, els.historyModal].forEach(closeModal);
  });
});
[els.downloadModal, els.historyModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', () => {
    [els.downloadModal, els.historyModal].forEach(closeModal);
  });
});

/* ══════════════════════════════════════════════
   PERFORMANCE
══════════════════════════════════════════════ */
let rafId = null;
const scheduleRender = () => {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    renderPreview();
    rafId = null;
  });
};
[els.brightnessSlider, els.contrastSlider, els.saturationSlider, els.borderWidthInput].forEach(el => {
  el.addEventListener('input', scheduleRender);
});

/* ══════════════════════════════════════════════
   SLIDER TRACK FILL
══════════════════════════════════════════════ */
function updateSliderTrack(slider) {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--val', pct + '%');
}
function initSliderTracks() {
  const brightSlider = els.brightnessSlider;
  const contrastSlider = els.contrastSlider;
  const satSlider = els.saturationSlider;
  const borderSlider = els.borderWidthInput;
  if (brightSlider)  { brightSlider.classList.add('brightness-track');  updateSliderTrack(brightSlider); }
  if (contrastSlider){ contrastSlider.classList.add('contrast-track');   updateSliderTrack(contrastSlider); }
  if (satSlider)     { satSlider.classList.add('saturation-track');      updateSliderTrack(satSlider); }
  if (borderSlider)  { borderSlider.classList.add('border-track');       updateSliderTrack(borderSlider); }
  [brightSlider, contrastSlider, satSlider, borderSlider].forEach(sl => {
    if (!sl) return;
    sl.addEventListener('input', () => updateSliderTrack(sl));
  });
}

/* ══════════════════════════════════════════════
   RIPPLE + MAGNETIC
══════════════════════════════════════════════ */
function addRipple(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top  - size / 2;
  const ripple = document.createElement('span');
  ripple.classList.add('ripple-effect');
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}
function initRipples() {
  document.querySelectorAll('.accent-btn, .glass-btn, .qty-btn, .dl-format-btn').forEach(btn => {
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.addEventListener('click', addRipple);
  });
}
function initMagneticButtons() {
  document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top  + rect.height / 2;
      const dx = (e.clientX - cx) * 0.12;
      const dy = (e.clientY - cy) * 0.12;
      btn.style.transform = `translate(${dx}px, ${dy}px) translateY(-3px) scale(1.02)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}
function animatePanelsIn() {
  const panels = document.querySelectorAll('#editor-section .glass-panel');
  panels.forEach((panel, i) => {
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(20px)';
    setTimeout(() => {
      panel.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.16,1,0.3,1)';
      panel.style.opacity = '';
      panel.style.transform = '';
    }, 80 + i * 60);
  });
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.welcome-orb').forEach((orb, i) => {
    orb.style.animationDelay = `${i * -2}s`;
  });
  initSliderTracks();
  initRipples();
  initMagneticButtons();
});

const editorObserver = new MutationObserver((mutations) => {
  mutations.forEach(m => {
    if (m.type === 'attributes' && m.attributeName === 'class') {
      const target = m.target;
      if (target.id === 'editor-section' && !target.classList.contains('hidden')) {
        animatePanelsIn();
      }
    }
  });
});
if ($('editor-section')) {
  editorObserver.observe($('editor-section'), { attributes: true });
}

console.log('%c SnapPass · Passport Photo Generator ', 'background:#6366f1;color:white;padding:4px 8px;border-radius:4px;font-family:monospace');

/* ══════════════════════════════════════════════
   ABOUT DEVELOPER PANEL
══════════════════════════════════════════════ */
(function () {
  const overlay  = $('about-dev-overlay');
  const panel    = $('about-dev-panel');
  const openBtn  = $('about-dev-btn');
  const closeBtn = $('close-about-btn');
  const backdrop = $('about-dev-backdrop');
  function openAbout() {
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
    document.body.style.overflow = 'hidden';
    Audio && Audio.click && Audio.click();
  }
  function closeAbout() {
    panel.classList.remove('open');
    setTimeout(() => { overlay.classList.add('hidden'); document.body.style.overflow = ''; }, 450);
  }
  if (openBtn)  openBtn.addEventListener('click', openAbout);
  if (closeBtn) closeBtn.addEventListener('click', closeAbout);
  if (backdrop) backdrop.addEventListener('click', closeAbout);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAbout(); });
})();

/* ══════════════════════════════════════════════
   FOOTER
══════════════════════════════════════════════ */
(function () {
  const footer = $('app-footer');
  const appEl  = $('app');
  if (!footer || !appEl) return;
  const obs = new MutationObserver(() => {
    if (!appEl.classList.contains('hidden')) footer.classList.remove('hidden');
  });
  obs.observe(appEl, { attributes: true, attributeFilter: ['class'] });
})();

/* ══════════════════════════════════════════════
   ACCOUNT & AUTH SYSTEM
══════════════════════════════════════════════ */
const APPS_SCRIPT = {
  url: 'https://script.google.com/macros/s/AKfycbwa926lZdRvdayffC3n7CS--r8k_aKdoU-_q2KcDdKeZWOo5ITPA3wIMJKFe0hN0d6vww/exec'
};
const RAZORPAY_KEY = 'rzp_live_SXqMLUhaqsFF6j';

const STORAGE = {
  user:            'snappass_user',
  startDate:       'snappass_trial_start',
  lastUsedDate:    'snappass_last_used',
  subPlan:         'snappass_sub_plan',
  subStart:        'snappass_sub_start',
  subExpiry:       'snappass_sub_expiry',
  sessionUnlocked: 'snappass_session_2'
};

function getUser()       { try { return JSON.parse(localStorage.getItem(STORAGE.user)); } catch(_){ return null; } }
function saveUser(u)     { localStorage.setItem(STORAGE.user, JSON.stringify(u)); }
function getSubExpiry()  { return localStorage.getItem(STORAGE.subExpiry) || null; }
function getSubPlan()    { return localStorage.getItem(STORAGE.subPlan) || null; }
function getSubStart()   { return localStorage.getItem(STORAGE.subStart) || null; }
function getTrialStart() { return localStorage.getItem(STORAGE.startDate) || null; }
function getLastUsed()   { return localStorage.getItem(STORAGE.lastUsedDate) || null; }

/* ══════════════════════════════════════════════
   INTERNET CHECK & WARNING BANNER SYSTEM
   ─ Shows top red banner + warning sound when offline
   ─ Blocks Begin button until internet confirmed
══════════════════════════════════════════════ */

// Session-level internet date cache (reset on every page load)
let _cachedInternetDate = null;   // YYYY-MM-DD string from internet
let _internetChecked    = false;  // has check been attempted this session?
let _internetOK         = false;  // true only if fetch succeeded

/* Plays a warning/error sound */
function playWarningSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Descending alarm: three harsh square pulses
    [[440, 0], [370, 0.18], [300, 0.36]].forEach(([freq, when]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + when);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.15);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + 0.16);
    });
  } catch (_) {}
}

/* Show the top red internet banner */
function showNoInternetBanner(msg) {
  const banner = document.getElementById('no-internet-banner');
  const msgEl  = document.getElementById('no-internet-msg');
  if (!banner) return;
  if (msg && msgEl) msgEl.textContent = msg;
  banner.classList.remove('hidden');
  // Auto-hide after 6 seconds
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(() => banner.classList.add('hidden'), 6000);
  playWarningSound();
}

/* Hide the internet banner */
function hideNoInternetBanner() {
  const banner = document.getElementById('no-internet-banner');
  if (banner) banner.classList.add('hidden');
}

/*
 * fetchInternetDate()
 * Fetches real current date from internet APIs.
 * Returns YYYY-MM-DD string or null if offline / failed.
 * Caches result for session.
 */
async function fetchInternetDate() {
  if (_cachedInternetDate) return _cachedInternetDate;
  const APIs = [
    { url: 'https://worldtimeapi.org/api/timezone/Asia/Kolkata', key: 'datetime' },
    { url: 'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Kolkata', key: 'dateTime' },
  ];
  for (const api of APIs) {
    try {
      const res = await fetch(api.url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      const dtStr = data[api.key] || data.datetime || data.dateTime || null;
      if (dtStr) {
        _cachedInternetDate = dtStr.split('T')[0]; // YYYY-MM-DD
        _internetOK = true;
        _internetChecked = true;
        return _cachedInternetDate;
      }
    } catch (_) { /* try next */ }
  }
  _internetChecked = true;
  _internetOK = false;
  return null;
}

/*
 * checkInternetOnBegin()
 * Called when user clicks Begin/Enter button.
 * If internet not available → show red banner + warning sound, block flow.
 * If internet OK → proceed normally.
 * Returns true if internet is available, false otherwise.
 */
async function checkInternetOnBegin() {
  const netDate = await fetchInternetDate();
  if (!netDate) {
    showNoInternetBanner('⚠️  No internet connection detected. Please check your internet and try again.');
    return false;
  }
  hideNoInternetBanner();
  // Advance lastUsed if internet date is ahead
  _advanceLastUsed(netDate);
  return true;
}

/*
 * checkUploadAllowed()
 * Called on every upload attempt (click / drop / file-input change).
 * Step 1: Fetch internet date → compare with device date.
 *         If mismatch (device date ≠ internet date) → show date-invalid modal, block.
 * Step 2: Check trial/subscription against internet date.
 *         If trial ended → show trial-ended modal, block.
 *         If sub active → allow.
 *         If trial active → allow.
 * Returns true if upload should proceed, false otherwise.
 */
async function checkUploadAllowed() {
  // Fetch internet date first
  const netDate = await fetchInternetDate();

  if (!netDate) {
    // Internet not available at upload time too
    showNoInternetBanner('⚠️  Internet required to verify your date. Please check your connection.');
    return false;
  }

  // Step 1: Device date vs internet date comparison
  const deviceDate = todayISO(); // new Date() based
  if (deviceDate !== netDate) {
    // Dates don't match — could be the user rolled clock back OR forward
    document.getElementById('date-invalid-modal')?.classList.remove('hidden');
    return false;
  }

  // Step 2: Advance lastUsed and check trial/sub
  _advanceLastUsed(netDate);

  const sub = getSubStatus();
  if (sub.active) return true; // paid subscription active ✓

  const trial = getTrialStatus();
  if (trial.active) return true; // free trial active ✓

  // Trial ended, no sub
  document.getElementById('trial-ended-modal')?.classList.remove('hidden');
  return false;
}

/* Helper: advance lastUsed date only forward (anti-cheat) */
function _advanceLastUsed(dateStr) {
  const stored = localStorage.getItem(STORAGE.lastUsedDate);
  if (!stored || dateStr > stored) {
    localStorage.setItem(STORAGE.lastUsedDate, dateStr);
  }
}

/* ══════════════════════════════════════════════
   DATE HELPERS
══════════════════════════════════════════════ */

function todayISO() { return new Date().toISOString().split('T')[0]; }
function parseDate(s) { return s ? new Date(s + 'T00:00:00') : null; }
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

/*
 * trueTodayISO()
 * Returns the most-advanced date between:
 *   • system clock  (todayISO)
 *   • internet date (_cachedInternetDate)
 *   • lastUsed stored date
 * This prevents date rollback attacks.
 */
function trueTodayISO() {
  const system  = todayISO();
  const net     = _cachedInternetDate || '';
  const stored  = localStorage.getItem(STORAGE.lastUsedDate) || '';
  return [system, net, stored].reduce((a, b) => (a > b ? a : b));
}

/* Local rollback detection */
function isDateTampered() {
  const last = localStorage.getItem(STORAGE.lastUsedDate);
  if (!last) return false;
  return todayISO() < last;
}
function updateLastUsed() {
  _advanceLastUsed(todayISO());
}

/* Trial status */
function getTrialStatus() {
  const start = getTrialStart();
  if (!start) return { active: false, expired: false, daysLeft: 0 };
  const today    = trueTodayISO();
  const trialEnd = addDays(start, 3);
  if (today <= trialEnd) {
    const daysLeft = Math.max(0, Math.round((parseDate(trialEnd) - parseDate(today)) / 86400000));
    return { active: true, expired: false, daysLeft, trialEnd };
  }
  return { active: false, expired: true, daysLeft: 0, trialEnd };
}

/* Subscription status */
function getSubStatus() {
  const expiry = getSubExpiry();
  if (!expiry) return { active: false, expired: false };
  const today = trueTodayISO();
  if (today <= expiry) {
    const daysLeft = Math.max(0, Math.round((parseDate(expiry) - parseDate(today)) / 86400000));
    return { active: true, expired: false, daysLeft, expiry, plan: getSubPlan(), start: getSubStart() };
  }
  return { active: false, expired: true, expiry, plan: getSubPlan(), start: getSubStart() };
}

function canUseBgRemoval() {
  if (isDateTampered()) return false;
  return getSubStatus().active || getTrialStatus().active;
}

/* ══════════════════════════════════════════════
   UPLOAD GATE — async check before any upload
══════════════════════════════════════════════ */
async function gateUpload(proceedFn) {
  const allowed = await checkUploadAllowed();
  if (allowed) proceedFn();
}

/* Apps Script helpers */
async function postToSheet(data) {
  try {
    await fetch(APPS_SCRIPT.url, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch(e) { console.warn('Apps Script post failed:', e); }
}
async function sendEmail(to, subject, body) { await postToSheet({ action: 'sendEmail', to, subject, body }); }
async function saveUserToSheet(user) {
  await postToSheet({ action: 'createUser', sheet: 'Sheet1', name: user.name, email: user.email, phone: user.phone, createdAt: todayISO() });
}
async function saveSubToSheet(email, plan, startDate, endDate) {
  await postToSheet({ action: 'upsertSubscription', sheet: 'Sheet2', email, plan, startDate, endDate });
}

/* FIX 4: BG removal button — disable when trial/sub active */
function updateBgRemovalState() {
  const btn = $('remove-bg-btn');
  const container = btn && btn.closest('.space-y-4');
  if (!btn) return;
  const existingOverlay = $('bg-locked-overlay');
  if (existingOverlay) existingOverlay.remove();
  if (canUseBgRemoval()) {
    btn.disabled = false;
    btn.classList.remove('bg-removal-locked');
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
  } else {
    btn.disabled = true;
    btn.classList.add('bg-removal-locked');
    const overlay = document.createElement('div');
    overlay.id = 'bg-locked-overlay';
    overlay.className = 'bg-removal-locked-overlay';
    if (isDateTampered()) {
      overlay.innerHTML = '<p>🔒 Date tampering detected. Please set correct date to continue.</p>';
    } else {
      const trial = getTrialStatus();
      if (trial.expired) {
        overlay.innerHTML = '<p>🔒 Free trial ended. <button onclick="openSubModal()" style="color:#a78bfa;font-weight:600;text-decoration:underline;background:none;border:none;cursor:pointer;">Subscribe to unlock</button></p>';
      } else {
        overlay.innerHTML = '<p>🔒 Subscribe to use AI Background Removal</p>';
      }
    }
    if (container) container.appendChild(overlay);
  }
}

/* FIX 4: Subscription button disable when trial/sub active */
function updateSubscriptionButtonsState() {
  const sub = getSubStatus();
  const trial = getTrialStatus();
  const isActive = sub.active || trial.active;
  
  // Disable sub plan cards when active
  document.querySelectorAll('.sub-plan-card').forEach(card => {
    if (isActive) {
      card.classList.add('disabled-plan');
      card.style.pointerEvents = 'none';
      card.style.opacity = '0.4';
    } else {
      card.classList.remove('disabled-plan');
      card.style.pointerEvents = '';
      card.style.opacity = '';
    }
  });
  
  // Update subscribe button
  const subBtn = $('subscribe-btn');
  if (subBtn && isActive) {
    if (!sub.active) {
      // Trial active — can still subscribe
      subBtn.classList.remove('opacity-40', 'pointer-events-none');
      subBtn.disabled = false;
    } else {
      // Sub active — disable
      subBtn.textContent = 'Active — Cannot purchase';
      subBtn.classList.add('opacity-40', 'pointer-events-none');
      subBtn.disabled = true;
    }
  }
  
  const activeNote = $('sub-active-note');
  if (activeNote) {
    if (sub.active) activeNote.classList.remove('hidden');
    else activeNote.classList.add('hidden');
  }
}

function openSubModal() {
  const overlay = $('subscription-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    refreshSubModal();
  }
}

function refreshSubModal() {
  const trial = getTrialStatus();
  const sub = getSubStatus();
  const trialBanner = $('sub-trial-banner');
  const trialText   = $('sub-trial-text');
  const activInfo   = $('active-sub-info');
  const expiredInfo = $('expired-sub-info');
  const subBtn      = $('subscribe-btn');
  const activeNote  = $('sub-active-note');

  if (trialText) {
    if (isDateTampered()) {
      trialText.textContent = '⚠️ Date tampering detected';
      trialBanner.style.background = 'rgba(239,68,68,0.1)';
      trialBanner.style.border = '1px solid rgba(239,68,68,0.25)';
      trialText.style.color = '#fca5a5';
    } else if (sub.active) {
      trialText.textContent = '✅ Your subscription is active';
      trialBanner.style.background = 'rgba(16,185,129,0.08)';
      trialBanner.style.border = '1px solid rgba(16,185,129,0.25)';
      trialText.style.color = '#6ee7b7';
    } else if (trial.active) {
      trialText.textContent = `🎁 Free Trial: ${trial.daysLeft} day${trial.daysLeft !== 1 ? 's' : ''} remaining`;
      trialBanner.style.background = 'rgba(99,102,241,0.1)';
      trialBanner.style.border = '1px solid rgba(99,102,241,0.2)';
      trialText.style.color = '#a5b4fc';
    } else {
      trialText.textContent = '⏰ Free trial has ended';
      trialBanner.style.background = 'rgba(239,68,68,0.08)';
      trialBanner.style.border = '1px solid rgba(239,68,68,0.2)';
      trialText.style.color = '#fca5a5';
    }
  }

  if (sub.active) {
    activInfo && activInfo.classList.remove('hidden');
    expiredInfo && expiredInfo.classList.add('hidden');
    const planNames = { '1month': '1 Month', '6months': '6 Months' };
    $('active-plan-name') && ($('active-plan-name').textContent = planNames[sub.plan] || sub.plan);
    $('active-start-date') && ($('active-start-date').textContent = formatDate(sub.start));
    $('active-end-date') && ($('active-end-date').textContent = formatDate(sub.expiry));
    $('active-days-remaining') && ($('active-days-remaining').textContent = `${sub.daysLeft} days`);
    // FIX 4: disable plan cards when sub active
    document.querySelectorAll('.sub-plan-card').forEach(c => {
      c.classList.add('disabled-plan');
      c.style.pointerEvents = 'none';
      c.style.opacity = '0.4';
    });
    if (subBtn) { subBtn.textContent = 'Active — Cannot purchase'; subBtn.classList.add('opacity-40','pointer-events-none'); subBtn.disabled = true; }
    if (activeNote) activeNote.classList.remove('hidden');
  } else {
    activInfo && activInfo.classList.add('hidden');
    if (sub.expired && sub.expiry) {
      expiredInfo && expiredInfo.classList.remove('hidden');
      const expText = $('expired-sub-date');
      if (expText) expText.textContent = `Subscription ended on ${formatDate(sub.expiry)}`;
    } else {
      expiredInfo && expiredInfo.classList.add('hidden');
    }
    // FIX 4: Re-enable plan cards when not subscribed (but still disable if trial active for plan cards only — can subscribe during trial)
    document.querySelectorAll('.sub-plan-card').forEach(c => {
      c.classList.remove('disabled-plan');
      c.style.pointerEvents = '';
      c.style.opacity = '';
    });
    if (subBtn) { subBtn.textContent = 'Select a Plan to Continue'; subBtn.classList.add('opacity-40','pointer-events-none'); subBtn.disabled = true; }
    if (activeNote) activeNote.classList.add('hidden');
  }
}

/* Razorpay payment */
function initiatePayment(plan, priceINR, amountPaise) {
  const user = getUser();
  if (!user) { showToast('Please login first', 'error'); return; }
  const planNames = { '1month': '1 Month', '6months': '6 Months' };
  const planDays  = { '1month': 30,         '6months': 183 };
  const options = {
    key: RAZORPAY_KEY, amount: amountPaise, currency: 'INR',
    name: 'SnapPass', description: `${planNames[plan]} Subscription`,
    prefill: { name: user.name, email: user.email, contact: user.phone },
    theme: { color: '#6366f1' },
    modal: { ondismiss: () => showToast('Payment cancelled', 'info') },
    handler: async function(response) {
      showLoading('Activating subscription…');
      // Use internet date — most tamper-proof source for subscription start
      const today = _cachedInternetDate || trueTodayISO();
      const endDate = addDays(today, planDays[plan]);
      localStorage.setItem(STORAGE.subPlan,   plan);
      localStorage.setItem(STORAGE.subStart,  today);
      localStorage.setItem(STORAGE.subExpiry, endDate);
      await saveSubToSheet(user.email, planNames[plan], today, endDate);
      await sendEmail(user.email, 'SnapPass Subscription Activated',
        `Hi ${user.name},\n\nYour SnapPass subscription is now active for ${planNames[plan]}.\n\nPlan: ${planNames[plan]}\nStart: ${formatDate(today)}\nExpiry: ${formatDate(endDate)}\n\nThank you!\nSnapPass Team`);
      hideLoading();
      updateBgRemovalState();
      updateSubStatusLabel();
      refreshSubModal();
      const overlay = $('subscription-overlay');
      if (overlay) overlay.classList.add('hidden');
      showToast(`🎉 Subscription activated for ${planNames[plan]}!`, 'success');
    }
  };
  try {
    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch(e) {
    hideLoading();
    showToast('Payment gateway not loaded. Please refresh.', 'error');
    console.error('Razorpay error:', e);
  }
}

function updateSubStatusLabel() {
  const label = $('sub-status-label');
  if (!label) return;
  const sub = getSubStatus();
  const trial = getTrialStatus();
  if (sub.active) {
    label.textContent = `Active · ${sub.daysLeft} days left`;
    label.style.color = '#6ee7b7';
  } else if (trial.active) {
    label.textContent = `Free trial · ${trial.daysLeft} days left`;
    label.style.color = '#a5b4fc';
  } else {
    label.textContent = 'No active plan';
    label.style.color = 'rgba(255,255,255,0.4)';
  }
}

/* ══════════════════════════════════════════════
   FIX 3: MAIN AUTH FLOW — sessionStorage for refresh detection
   
   KEY LOGIC:
   - sessionStorage persists across REFRESH but NOT across tab close/reopen
   - localStorage persists forever (user data)
   
   On REFRESH: sessionStorage flag exists → skip password, show app
   On FRESH OPEN (close+reopen): sessionStorage cleared → show password
══════════════════════════════════════════════ */
(function initAuth() {
  const createScreen    = $('create-account-screen');
  const returningScreen = $('returning-login-screen');

  if (isDateTampered()) {
    console.warn('Date tampering detected');
  }

  // FIX 3A: If session is already unlocked (same session = refresh), skip password
  if (sessionStorage.getItem(STORAGE.sessionUnlocked)) {
    if (createScreen)    createScreen.style.display = 'none';
    if (returningScreen) returningScreen.style.display = 'none';
    updateLastUsed();
    updateBgRemovalState();
    updateSubStatusLabel();
    showSupportBtn();
    const appEl = $('app');
    if (appEl) appEl.classList.remove('hidden');
    return;
  }

  const user = getUser();

  function unlockApp() {
    // FIX 3B: Set sessionStorage flag so refresh won't ask password again
    sessionStorage.setItem(STORAGE.sessionUnlocked, '1');
    updateLastUsed();
    updateBgRemovalState();
    updateSubStatusLabel();
    showSupportBtn();
    const appEl = $('app');
    // Hide ALL possible screens (intro, create, returning) before showing app
    const allScreens = [
      createScreen,
      returningScreen,
      $('intro-screen'),
      $('returning-login-screen'),
      $('create-account-screen'),
    ];
    allScreens.forEach(s => {
      if (!s) return;
      s.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      s.style.opacity = '0';
      s.style.transform = 'scale(1.04)';
      setTimeout(() => {
        s.style.display = 'none';
        if (appEl) { appEl.classList.remove('hidden'); appEl.classList.add('fade-in'); }
      }, 520);
    });
    // If no screens were visible, show app directly
    setTimeout(() => {
      if (appEl && appEl.classList.contains('hidden')) {
        appEl.classList.remove('hidden');
        appEl.classList.add('fade-in');
      }
    }, 550);
  }
  // Expose globally so enterBtn click (outside IIFE) can also call unlockApp
  window.unlockApp = unlockApp;

  // ── CREATE ACCOUNT FLOW ──
  if (!user) {
    if (returningScreen) returningScreen.style.display = 'none';
    if (!createScreen) return;
    const createBtn = $('create-account-btn');
    const errEl     = $('acc-error');
    const successEl = $('acc-success');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        const name  = $('acc-name')?.value.trim();
        const email = $('acc-email')?.value.trim();
        const phone = $('acc-phone')?.value.trim();
        const pass  = $('acc-password')?.value;
        if (!name || !email || !phone || !pass) {
          if (errEl) { errEl.textContent = '✕ Please fill in all fields.'; errEl.classList.remove('hidden'); }
          return;
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          if (errEl) { errEl.textContent = '✕ Invalid email address.'; errEl.classList.remove('hidden'); }
          return;
        }
        if (pass.length < 4) {
          if (errEl) { errEl.textContent = '✕ Password must be at least 4 characters.'; errEl.classList.remove('hidden'); }
          return;
        }
        if (errEl) errEl.classList.add('hidden');
        createBtn.disabled = true;
        createBtn.textContent = 'Creating account…';

        // Use internet date for trial start — most accurate & tamper-proof
        const trialStartDate = _cachedInternetDate || todayISO();
        const userData = { name, email, phone, password: pass, createdAt: trialStartDate };
        saveUser(userData);
        localStorage.setItem(STORAGE.startDate, trialStartDate);
        _advanceLastUsed(trialStartDate);
        await saveUserToSheet(userData);
        await sendEmail(email, 'Welcome to SnapPass!',
          `Hi ${name},\n\nYour account has been created successfully.\n\nYou have a 3-day free trial to explore SnapPass.\n\n⚠️ Note: This account works only on this device. If you delete the app, access will be lost permanently.\n\nEnjoy creating professional passport photos!\n\nSnapPass Team`);
        if (successEl) successEl.classList.remove('hidden');
        setTimeout(() => unlockApp(), 1200);
      });
    }
  } else {
    // ── RETURNING USER — Password removed, direct unlock via enterBtn ──
    if (createScreen) createScreen.style.display = 'none';
    if (returningScreen) returningScreen.style.display = 'none';
  }
})();

function showSupportBtn() {
  const wrap = $('support-btn-wrap');
  if (wrap) {
    wrap.style.display = 'flex';
    wrap.classList.add('flex');
    wrap.classList.remove('hidden');
  }
}

/* ══════════════════════════════════════════════
   SUPPORT PANEL
══════════════════════════════════════════════ */
(function initSupportPanel() {
  const overlay  = $('support-overlay');
  const backdrop = $('support-backdrop');
  const openBtn  = $('open-support-btn');
  const closeBtn = $('close-support-btn');
  if (!overlay) return;
  const panel = $('support-panel');
  function open() {
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => { if (panel) panel.classList.add('open'); }));
    document.body.style.overflow = 'hidden';
  }
  function close() {
    if (panel) panel.classList.remove('open');
    setTimeout(() => { overlay.classList.add('hidden'); document.body.style.overflow = ''; }, 450);
  }
  if (openBtn)  openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
})();

/* ══════════════════════════════════════════════
   SUBSCRIPTION MODAL LOGIC
══════════════════════════════════════════════ */
(function initSubModal() {
  const overlay  = $('subscription-overlay');
  const closeBtn = $('close-sub-modal');
  const subBtn   = $('subscribe-btn');
  const openBtn  = $('open-subscription-btn');
  if (!overlay) return;
  let selectedPlan = null, selectedPrice = null, selectedAmount = null;
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      const aboutOverlay = $('about-dev-overlay');
      if (aboutOverlay) aboutOverlay.classList.add('hidden');
      openSubModal();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.classList.contains('modal-bg')) overlay.classList.add('hidden');
  });

  // Plan selection — show trial-active warning if trial is running
  document.querySelectorAll('.sub-plan-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.classList.contains('disabled-plan')) return;
      const sub = getSubStatus();
      if (sub.active) return; // already subscribed

      // ── NEW: If trial is still active, show center warning ──
      const trial = getTrialStatus();
      if (trial.active) {
        const trialModal = document.getElementById('trial-active-modal');
        if (trialModal) trialModal.classList.remove('hidden');
        return;
      }

      document.querySelectorAll('.sub-plan-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPlan   = card.dataset.plan;
      selectedPrice  = card.dataset.price;
      selectedAmount = parseInt(card.dataset.amount);
      if (subBtn) {
        subBtn.textContent = `Pay ₹${selectedPrice} – Subscribe`;
        subBtn.disabled = false;
        subBtn.classList.remove('opacity-40', 'pointer-events-none');
      }
    });
  });

  // Subscribe button — password verification before payment
  if (subBtn) {
    subBtn.addEventListener('click', () => {
      if (!selectedPlan) return;
      const sub = getSubStatus();
      if (sub.active) { showToast('You already have an active subscription', 'info'); return; }

      // ── NEW: Show password verification modal ──
      overlay.classList.add('hidden');
      showPasswordVerifyModal(selectedPlan, selectedPrice, selectedAmount);
    });
  }
})();

/* ══════════════════════════════════════════════
   PASSWORD VERIFICATION MODAL — Before payment
══════════════════════════════════════════════ */
function showPasswordVerifyModal(plan, price, amount) {
  const modal   = document.getElementById('password-verify-modal');
  const input   = document.getElementById('pw-verify-input');
  const errEl   = document.getElementById('pw-verify-error');
  const confirmBtn = document.getElementById('pw-verify-confirm-btn');
  if (!modal || !input || !confirmBtn) {
    // Fallback — proceed directly
    initiatePayment(plan, price, amount);
    return;
  }
  input.value = '';
  errEl.classList.add('hidden');
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 300);

  // Remove old listeners to avoid duplicates
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  // Remove any old keydown listener by cloning the input too
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  const freshInput = document.getElementById('pw-verify-input');
  setTimeout(() => freshInput.focus(), 300);

  function doVerify() {
    const user = getUser();
    if (!user) { modal.classList.add('hidden'); initiatePayment(plan, price, amount); return; }
    const entered = freshInput.value;
    if (!entered) {
      errEl.textContent = '❌ Please enter your password.';
      errEl.classList.remove('hidden');
      freshInput.focus();
      return;
    }
    if (entered === user.password) {
      // Correct password — proceed
      modal.classList.add('hidden');
      freshInput.value = '';
      errEl.classList.add('hidden');
      initiatePayment(plan, price, amount);
    } else {
      // Wrong password
      errEl.textContent = '❌ Password incorrect. Please try again.';
      errEl.classList.remove('hidden');
      freshInput.value = '';
      freshInput.focus();
      Audio.error && Audio.error();
    }
  }

  newConfirmBtn.addEventListener('click', doVerify);

  // Allow Enter key to confirm
  function onEnter(e) {
    if (e.key === 'Enter') { doVerify(); }
    if (e.key === 'Escape') {
      modal.classList.add('hidden');
      freshInput.value = '';
      errEl.classList.add('hidden');
      freshInput.removeEventListener('keydown', onEnter);
    }
  }
  freshInput.addEventListener('keydown', onEnter);
}

/* ══════════════════════════════════════════════
   SECURITY — Right-click & DevTools detection
══════════════════════════════════════════════ */
(function initSecurity() {
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key)) ||
      (e.ctrlKey && e.key === 'U')
    ) {
      e.preventDefault();
      return false;
    }
  });
  const threshold = 160;
  function detectDevTools() {
    const widthDiff  = window.outerWidth  - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    if (widthDiff > threshold || heightDiff > threshold) {
      console.clear();
      console.log('%c⛔ DevTools Disabled', 'color:red;font-size:24px;font-weight:bold;');
    }
  }
  setInterval(detectDevTools, 1000);
})();
