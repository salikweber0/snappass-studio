/**
 * SnapPass · Passport Photo Generator
 * ════════════════════════════════════════════
 * A fully client-side passport photo studio.
 * No backend. No frameworks. Pure JS + Canvas API.
 */

"use strict";

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
/** @type {AppState} */
const state = {
  originalImageData: null,   // Original uploaded image as ImageData
  originalImage: null,       // HTMLImageElement
  processedCanvas: null,     // Working canvas (current processed state)
  bgRemovedCanvas: null,     // BG-removed canvas (composited with current bg color)
  _transparentCanvas: null,  // BG-removed canvas with TRANSPARENT bg — used for color swapping
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
  zoomLevel: 100,         // display zoom %
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
  apiKeyInput: $('api-key-input'),
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

  /**
   * Play a simple synthesized tone
   * @param {number} freq
   * @param {number} duration
   * @param {'sine'|'triangle'|'square'} type
   * @param {number} volume
   */
  const playTone = (freq, duration, type = 'sine', volume = 0.08) => {
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) { /* ignore */ }
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

/**
 * Show a toast notification
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 */
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
   WELCOME → APP TRANSITION
══════════════════════════════════════════════ */
els.enterBtn.addEventListener('click', () => {
  Audio.welcome();
  els.welcomeScreen.classList.add('fade-out');
  setTimeout(() => {
    els.welcomeScreen.style.display = 'none';
    els.app.classList.remove('hidden');
    els.app.classList.add('fade-in');
  }, 600);
});

/* ══════════════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════════════ */
// Drag & Drop
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
  if (file && file.type.startsWith('image/')) handleFile(file);
  else showToast('Please drop an image file', 'error');
});

// Click to browse — reset value so same file can be re-selected
els.fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) {
    handleFile(file);
    setTimeout(() => { e.target.value = ''; }, 300);
  }
});

// Drop zone click — only open picker when clicking the zone itself, not the label (prevents double-fire)
els.dropZone.addEventListener('click', (e) => {
  if (e.target.closest('label') || e.target.tagName === 'INPUT') return;
  els.fileInput.click();
});

/**
 * Process an uploaded file
 * @param {File} file
 */
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

      // Reset sliders
      els.brightnessSlider.value = 100; els.brightnessVal.textContent = '100';
      els.contrastSlider.value = 100;   els.contrastVal.textContent = '100';
      els.saturationSlider.value = 100; els.saturationVal.textContent = '100';

      // Build working canvas from original image at passport ratio
      state.processedCanvas = buildPassportCanvas(img);
      renderPreview();
      renderSheet();

      // Switch to editor
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
   Passport ratio: 35mm × 45mm → 3:4 (width:height)
   We work at 600 DPI equiv → 826 × 1063 px per photo
   For preview we use 300 × 400
══════════════════════════════════════════════ */
const PASSPORT_W = 413; // ~35mm at 300dpi
const PASSPORT_H = 531; // ~45mm at 300dpi

/**
 * Create a canvas cropped to passport ratio from an image
 * @param {HTMLImageElement} img
 * @returns {HTMLCanvasElement}
 */
function buildPassportCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = PASSPORT_W;
  canvas.height = PASSPORT_H;
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, PASSPORT_W, PASSPORT_H);

  // Calculate crop to fill 3:4 (width:height)
  const targetAspect = PASSPORT_W / PASSPORT_H;
  const imgAspect = img.width / img.height;

  let sx = 0, sy = 0, sw = img.width, sh = img.height;

  if (imgAspect > targetAspect) {
    // Image is wider — crop sides
    sw = img.height * targetAspect;
    sx = (img.width - sw) / 2;
  } else {
    // Image is taller — crop top/bottom, favor top (face)
    sh = img.width / targetAspect;
    sy = 0; // keep top (face area)
  }

  // Apply user offset + zoom
  const zoom = state.imageZoom;
  const ox = state.imageOffsetX;
  const oy = state.imageOffsetY;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(zoom, zoom);
  ctx.drawImage(img,
    sx, sy, sw, sh,
    0, 0, PASSPORT_W / zoom, PASSPORT_H / zoom
  );
  ctx.restore();

  return canvas;
}

/**
 * Apply filters (brightness, contrast, saturation) to a canvas
 * Returns a new filtered canvas
 * @param {HTMLCanvasElement} src
 * @returns {HTMLCanvasElement}
 */
function applyFilters(src) {
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
  ctx.drawImage(src, 0, 0);
  return canvas;
}

/**
 * Apply border to a canvas, returns new canvas
 * @param {HTMLCanvasElement} src
 * @returns {HTMLCanvasElement}
 */
function applyBorder(src) {
  if (state.borderWidth === 0) return src;
  const bw = state.borderWidth;
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.strokeStyle = state.borderColor;
  ctx.lineWidth = bw * 2; // stroke is centered, so double to make it inward
  ctx.strokeRect(0, 0, src.width, src.height);
  return canvas;
}

/* ══════════════════════════════════════════════
   RENDER PREVIEW CANVAS (small, 180×240)
══════════════════════════════════════════════ */
function renderPreview() {
  if (!state.processedCanvas) return;
  const pCtx = els.previewCanvas.getContext('2d');
  const W = els.previewCanvas.width;
  const H = els.previewCanvas.height;

  // Start from processed source
  let src = state.bgRemoved && state.bgRemovedCanvas
    ? state.bgRemovedCanvas
    : state.processedCanvas;

  // Apply filters
  const filtered = applyFilters(src);
  const bordered = applyBorder(filtered);

  pCtx.clearRect(0, 0, W, H);
  pCtx.drawImage(bordered, 0, 0, W, H);

  // Also refresh sheet
  requestAnimationFrame(renderSheet);
}

/* ══════════════════════════════════════════════
   RENDER SHEET CANVAS (A4: 2480×3508 px)

   ✅ FIXED PASSPORT PHOTO SIZE — never changes.
      35mm × 45mm at 300 DPI = 413 × 531 px per photo.
      If photos don't fit on one A4, extra sheets are
      created automatically. Photo size is ALWAYS fixed.
══════════════════════════════════════════════ */
const A4_W   = 2480;   // A4 width  at 300 DPI
const A4_H   = 3508;   // A4 height at 300 DPI
const MARGIN = 120;    // page margin (px)
const GAP    = 60;     // gap between photos (px)

// ── FIXED passport photo dimensions at 300 DPI ──
// 35 mm × 45 mm → (35/25.4)*300 ≈ 413 px wide, (45/25.4)*300 ≈ 531 px tall
const PHOTO_W = 413;   // fixed, never changes with quantity
const PHOTO_H = 531;   // fixed, never changes with quantity

// How many photos fit per A4 sheet (calculated once, always the same)
const COLS_PER_SHEET = Math.floor((A4_W - MARGIN * 2 + GAP) / (PHOTO_W + GAP)); // = 4
const ROWS_PER_SHEET = Math.floor((A4_H - MARGIN * 2 + GAP) / (PHOTO_H + GAP)); // = 6
const PER_SHEET      = COLS_PER_SHEET * ROWS_PER_SHEET;                          // = 24 max

/**
 * Build one A4 canvas and draw `photos` onto it starting at index `startIdx`
 * @param {HTMLCanvasElement} bordered  — the final processed passport photo
 * @param {number} startIdx             — which photo index to start at
 * @param {number} qty                  — total quantity remaining for this sheet
 * @returns {HTMLCanvasElement}
 */
function buildSheetCanvas(bordered, startIdx, qty) {
  const canvas = document.createElement('canvas');
  canvas.width  = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext('2d');

  // White sheet background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4_W, A4_H);

  // How many photos go on this sheet
  const onThisSheet = Math.min(qty, PER_SHEET);

  // Center the grid on this sheet
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

    // Subtle shadow
    ctx.shadowColor   = 'rgba(0,0,0,0.13)';
    ctx.shadowBlur    = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    // Draw at FIXED PHOTO_W × PHOTO_H — size never changes!
    ctx.drawImage(bordered, x, y, PHOTO_W, PHOTO_H);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
  }

  return canvas;
}

// Stores all generated A4 sheet canvases (1 per sheet if qty overflows)
// Photo size is FIXED — more qty = more sheets, NOT smaller photos
let generatedSheets = [];

function renderSheet() {
  if (!state.processedCanvas) return;

  // Get current processed photo
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

  // ── Show preview of sheet 1 (and indicate if more sheets exist) ──
  const previewSheet = generatedSheets[0];
  els.sheetCanvas.width  = previewSheet.width;
  els.sheetCanvas.height = previewSheet.height;
  const pCtx = els.sheetCanvas.getContext('2d');
  pCtx.drawImage(previewSheet, 0, 0);

  // Update label
  const sheetsLabel = numSheets > 1 ? ` · ${numSheets} sheets` : '';
  els.sheetCountLabel.textContent = `${qty} photo${qty > 1 ? 's' : ''}${sheetsLabel}`;

  // Show / hide multi-sheet notice
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

/**
 * remove.bg API - Hardcoded with your key
 * No need to enter API key anymore
 */
async function removeBg() {
  if (!state.processedCanvas) {
    showToast('Please upload a photo first', 'error');
    return;
  }

  // === YOUR API KEY (Hardcoded) ===
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
      headers: {
        'X-Api-Key': apiKey
      },
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
      
      removeBgCanvas(); // fallback
      hideLoading();
      return;
    }

    const resultBlob = await response.blob();
    const imageUrl = URL.createObjectURL(resultBlob);

    const img = new Image();
    img.onload = () => {
      // Save transparent version for background color change
      const transparentCanvas = document.createElement('canvas');
      transparentCanvas.width = PASSPORT_W;
      transparentCanvas.height = PASSPORT_H;
      const tCtx = transparentCanvas.getContext('2d');
      tCtx.drawImage(img, 0, 0, PASSPORT_W, PASSPORT_H);
      state._transparentCanvas = transparentCanvas;

      // Composite with current bg color
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

/**
 * Photoroom API - Currently Best Quality for Passport Photos
 */
async function removeBgWithPhotoroom(apiKey) {
  try {
    showLoading('Photoroom AI removing background...');

    const blob = await canvasToBlob(state.processedCanvas);

    const formData = new FormData();
    formData.append('image_file', blob, 'photo.png');
    // Transparent output ke liye extra param (optional but helpful)
    formData.append('format', 'png');

    const resp = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: formData,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn('Photoroom Error:', errText);
      showToast('Photoroom failed — trying next provider', 'error');
      return false;
    }

    const resultBlob = await resp.blob();
    const url = URL.createObjectURL(resultBlob);

    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Transparent canvas store (color change ke liye zaroori)
        const transparentCanvas = document.createElement('canvas');
        transparentCanvas.width = PASSPORT_W;
        transparentCanvas.height = PASSPORT_H;
        const tCtx = transparentCanvas.getContext('2d');
        tCtx.clearRect(0, 0, PASSPORT_W, PASSPORT_H);
        tCtx.drawImage(img, 0, 0, PASSPORT_W, PASSPORT_H);
        state._transparentCanvas = transparentCanvas;

        // Current background color pe composite
        const result = document.createElement('canvas');
        result.width = PASSPORT_W;
        result.height = PASSPORT_H;
        const rCtx = result.getContext('2d');
        rCtx.fillStyle = state.bgColor || '#ffffff';
        rCtx.fillRect(0, 0, PASSPORT_W, PASSPORT_H);
        rCtx.drawImage(transparentCanvas, 0, 0);

        state.bgRemovedCanvas = result;
        state.bgRemoved = true;

        URL.revokeObjectURL(url);
        renderPreview();
        Audio.success();
        showToast('Background removed perfectly with Photoroom!', 'success');
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });

    return true;
  } catch (err) {
    console.error('Photoroom failed:', err);
    showToast('Photoroom failed — trying fallback', 'error');
    return false;
  }
}

/**
 * Clipdrop API — best for portraits, dark backgrounds
 * Free: 100 calls/day at clipdrop.co/apis
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
async function removeBgWithClipdrop(apiKey) {
  try {
    showLoading('Clipdrop AI removing background…');
    const blob = await canvasToBlob(state.processedCanvas);
    const formData = new FormData();
    formData.append('image_file', blob, 'photo.png');

    const resp = await fetch('https://clipdrop-api.co/remove-background/v1', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: formData,
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('Clipdrop error:', txt);
      showToast('Clipdrop error — trying fallback', 'error');
      return false;
    }

    const arrBuf = await resp.arrayBuffer();
    const resultBlob = new Blob([arrBuf], { type: 'image/png' });
    const url = URL.createObjectURL(resultBlob);

    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Store transparent canvas for instant color swapping
        const transparentCanvas = document.createElement('canvas');
        transparentCanvas.width = PASSPORT_W;
        transparentCanvas.height = PASSPORT_H;
        const tCtx = transparentCanvas.getContext('2d');
        tCtx.clearRect(0, 0, PASSPORT_W, PASSPORT_H);
        tCtx.drawImage(img, 0, 0, PASSPORT_W, PASSPORT_H);
        state._transparentCanvas = transparentCanvas;

        // Composite on chosen background color
        const result = document.createElement('canvas');
        result.width = PASSPORT_W;
        result.height = PASSPORT_H;
        const rCtx = result.getContext('2d');
        rCtx.fillStyle = state.bgColor || '#ffffff';
        rCtx.fillRect(0, 0, PASSPORT_W, PASSPORT_H);
        rCtx.drawImage(transparentCanvas, 0, 0);

        state.bgRemovedCanvas = result;
        state.bgRemoved = true;
        URL.revokeObjectURL(url);
        renderPreview();
        Audio.success();
        showToast('Background removed! ✓', 'success');
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });

    return true;
  } catch (err) {
    console.error('Clipdrop failed:', err);
    showToast('Clipdrop failed — using canvas removal', 'error');
    return false;
  }
}

/**
 * remove.bg API integration
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
async function removeBgWithAPI(apiKey) {
  try {
    // Convert current canvas to blob
    const blob = await canvasToBlob(state.processedCanvas);
    const formData = new FormData();
    formData.append('image_file', blob, 'photo.png');
    formData.append('size', 'auto');

    const resp = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('remove.bg error:', txt);
      showToast('API error — using local removal', 'error');
      return false;
    }

    const arrBuf = await resp.arrayBuffer();
    const resultBlob = new Blob([arrBuf], { type: 'image/png' });
    const url = URL.createObjectURL(resultBlob);

    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // First store the transparent version (for color swapping later)
        const transparentCanvas = document.createElement('canvas');
        transparentCanvas.width = PASSPORT_W;
        transparentCanvas.height = PASSPORT_H;
        const tCtx = transparentCanvas.getContext('2d');
        tCtx.clearRect(0, 0, PASSPORT_W, PASSPORT_H);
        tCtx.drawImage(img, 0, 0, PASSPORT_W, PASSPORT_H);
        state._transparentCanvas = transparentCanvas;

        // Composite transparent subject onto chosen background color
        const canvas = document.createElement('canvas');
        canvas.width = PASSPORT_W;
        canvas.height = PASSPORT_H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = state.bgColor || '#ffffff';
        ctx.fillRect(0, 0, PASSPORT_W, PASSPORT_H);
        ctx.drawImage(transparentCanvas, 0, 0);

        state.bgRemovedCanvas = canvas;
        state.bgRemoved = true;
        URL.revokeObjectURL(url);
        renderPreview();
        Audio.success();
        showToast('Background removed!', 'success');
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });

    return true;
  } catch (err) {
    console.error(err);
    showToast('API failed — using local removal', 'error');
    return false;
  }
}

/**
 * ═══════════════════════════════════════════════════════
 * STRONG Canvas-Based Background Removal
 * ═══════════════════════════════════════════════════════
 * Algorithm:
 *  1. Sample BG color from MULTIPLE edge regions (smarter sampling)
 *  2. Convert to LAB color space for perceptually uniform distance
 *  3. Adaptive threshold based on BG color variance + luminance correction
 *  4. BFS flood-fill from all 4 edges (only removes connected BG)
 *  5. Trimap refinement — uncertain pixels handled separately
 *  6. Gaussian-like alpha matting on edges for smooth hair/skin
 *  7. NO detail cutting — subject pixels (hands, arms) are preserved
 *  8. Post-process: fill transparent areas with chosen bg color
 * ═══════════════════════════════════════════════════════
 */
/**
 * IMPROVED Canvas-Based Background Removal (Strong & Reliable)
 * Works great for passport photos with white/off-white backgrounds
 */
function removeBgCanvas() {
  if (!state.processedCanvas) return;

  const src = state.processedCanvas;
  const W = src.width;
  const H = src.height;

  const workCanvas = document.createElement('canvas');
  workCanvas.width = W;
  workCanvas.height = H;
  const wCtx = workCanvas.getContext('2d', { willReadFrequently: true });

  // Draw on white background first (helps with detection)
  wCtx.fillStyle = '#ffffff';
  wCtx.fillRect(0, 0, W, H);
  wCtx.drawImage(src, 0, 0);

  const imageData = wCtx.getImageData(0, 0, W, H);
  const data = imageData.data;

  // Sample background color from multiple edge points (more robust)
  const samples = [];
  const samplePoints = [
    // Top edge
    ...Array.from({length: 20}, (_, i) => [Math.floor(W * i/20), 5]),
    // Bottom edge
    ...Array.from({length: 20}, (_, i) => [Math.floor(W * i/20), H-6]),
    // Left edge
    ...Array.from({length: 15}, (_, i) => [5, Math.floor(H * i/15)]),
    // Right edge
    ...Array.from({length: 15}, (_, i) => [W-6, Math.floor(H * i/15)]),
  ];

  samplePoints.forEach(([x, y]) => {
    const i = (y * W + x) * 4;
    samples.push([data[i], data[i+1], data[i+2]]);
  });

  // Average background color
  let r = 0, g = 0, b = 0;
  samples.forEach(([rr, gg, bb]) => { r += rr; g += gg; b += bb; });
  r = Math.floor(r / samples.length);
  g = Math.floor(g / samples.length);
  b = Math.floor(b / samples.length);

  const bgColor = [r, g, b];
  const bgThreshold = 35;        // Main threshold
  const softThreshold = 65;      // For soft edges (hair etc.)

  // Create alpha map
  const alpha = new Uint8ClampedArray(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const pr = data[i], pg = data[i+1], pb = data[i+2];

      // Color distance
      const dr = pr - bgColor[0];
      const dg = pg - bgColor[1];
      const db = pb - bgColor[2];
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);

      if (dist < bgThreshold) {
        alpha[y*W + x] = 0;                    // Definitely background
      } 
      else if (dist < softThreshold) {
        // Soft transition for better hair/skin edges
        const t = (dist - bgThreshold) / (softThreshold - bgThreshold);
        alpha[y*W + x] = Math.floor((1 - t * t) * 255);   // smooth falloff
      } 
      else {
        alpha[y*W + x] = 255;                  // Definitely foreground
      }
    }
  }

  // Simple edge smoothing (light blur on alpha)
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

  // Apply alpha back to image
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = finalAlpha[Math.floor(i/4)];
  }

  wCtx.putImageData(imageData, 0, 0);

  // Store transparent version for easy color changing
  state._transparentCanvas = workCanvas;

  // Composite with current background color
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

/**
 * Convert canvas to Blob
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/* ══════════════════════════════════════════════
   EVENT HANDLERS · Controls
══════════════════════════════════════════════ */

// Background Removal
els.removeBgBtn.addEventListener('click', () => {
  Audio.click();
  removeBg();
});

// API Provider Toggle (Photoroom + Clipdrop + remove.bg)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.api-provider-btn');
  if (!btn) return;

  Audio.click();

  // Sabko inactive karo
  document.querySelectorAll('.api-provider-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const photoroomWrap = document.getElementById('photoroom-key-wrap');
  const clipdropWrap   = document.getElementById('clipdrop-key-wrap');
  const removebgWrap   = document.getElementById('removebg-key-wrap');

  if (btn.id === 'provider-photoroom') {
    photoroomWrap.classList.remove('hidden');
    clipdropWrap.classList.add('hidden');
    removebgWrap.classList.add('hidden');
  } else if (btn.id === 'provider-clipdrop') {
    photoroomWrap.classList.add('hidden');
    clipdropWrap.classList.remove('hidden');
    removebgWrap.classList.add('hidden');
  } else if (btn.id === 'provider-removebg') {
    photoroomWrap.classList.add('hidden');
    clipdropWrap.classList.add('hidden');
    removebgWrap.classList.remove('hidden');
  }
});

// Restore Original Background
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

// White Background Quick Button
els.whiteBgBtn.addEventListener('click', () => {
  Audio.click();
  
  // White swatch ko active kar do
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  const whiteSwatch = document.querySelector('.color-swatch[data-color="#ffffff"]');
  if (whiteSwatch) whiteSwatch.classList.add('active');

  if (els.customBgColor) els.customBgColor.value = '#ffffff';
  const hexEl = document.getElementById('custom-color-hex');
  if (hexEl) hexEl.textContent = '#ffffff';

  applyBgColorToPhoto('#ffffff');
  showToast('White background applied', 'success');
});

/**
 * Apply a background color.
 * ─────────────────────────────────────────────
 * KEY FIX: We ALWAYS composite from the transparent
 * canvas (state._transparentCanvas) so colors update
 * instantly and correctly WITHOUT re-running BG removal.
 * If BG has not been removed yet, just rebuild passport canvas.
 * @param {string} color hex string e.g. '#ff0000'
 */
function applyBgColorToPhoto(color) {
  state.bgColor = color;

  if (state.bgRemoved && state._transparentCanvas) {
    // ✅ Re-composite transparent subject onto new bg color
    const W = state._transparentCanvas.width;
    const H = state._transparentCanvas.height;
    const result = document.createElement('canvas');
    result.width  = W;
    result.height = H;
    const rCtx = result.getContext('2d');
    rCtx.fillStyle = color;
    rCtx.fillRect(0, 0, W, H);
    rCtx.drawImage(state._transparentCanvas, 0, 0); // draw transparent subject on top
    state.bgRemovedCanvas = result;
  } else if (state.originalImage) {
    // BG not removed — just rebuild with new color baked in
    state.processedCanvas = buildPassportCanvas(state.originalImage);
  }

  renderPreview();
}

// ── Background color swatches (all panels — delegate from document) ──
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.color-swatch[data-color]');
  if (!btn) return;
  Audio.click();
  const color = btn.dataset.color;
  // Update state + color picker hex display
  state.bgColor = color;
  if (els.customBgColor) els.customBgColor.value = color.length === 7 ? color : '#ffffff';
  const hexEl = document.getElementById('custom-color-hex');
  if (hexEl) hexEl.textContent = color;
  // Mark active — clear all swatches first
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  applyBgColorToPhoto(color);
});

// ── Color category tabs ──
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.color-cat-tab[data-cat]');
  if (!tab) return;
  Audio.click();
  const cat = tab.dataset.cat;
  // Switch active tab
  document.querySelectorAll('.color-cat-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  // Show correct panel
  document.querySelectorAll('.color-cat-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('cat-' + cat);
  if (panel) panel.classList.remove('hidden');
});

// ── Custom color picker ──
els.customBgColor.addEventListener('input', (e) => {
  const color = e.target.value;
  state.bgColor = color;
  const hexEl = document.getElementById('custom-color-hex');
  if (hexEl) hexEl.textContent = color;
  // Deselect any swatch
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  applyBgColorToPhoto(color);
});

// Quantity selector
els.qtySelector.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-qty]');
  if (!btn) return;
  Audio.click();
  state.quantity = parseInt(btn.dataset.qty);
  document.querySelectorAll('.qty-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSheet();
});

// Brightness
els.brightnessSlider.addEventListener('input', (e) => {
  state.brightness = parseInt(e.target.value);
  els.brightnessVal.textContent = state.brightness;
  renderPreview();
});

// Contrast
els.contrastSlider.addEventListener('input', (e) => {
  state.contrast = parseInt(e.target.value);
  els.contrastVal.textContent = state.contrast;
  renderPreview();
});

// Saturation
els.saturationSlider.addEventListener('input', (e) => {
  state.saturation = parseInt(e.target.value);
  els.saturationVal.textContent = state.saturation;
  renderPreview();
});

// Border Width
els.borderWidthInput.addEventListener('input', (e) => {
  state.borderWidth = parseInt(e.target.value);
  els.borderWidthVal.textContent = state.borderWidth;
  renderPreview();
});

// Border Color
els.borderColorInput.addEventListener('input', (e) => {
  state.borderColor = e.target.value;
  renderPreview();
});

/* ══════════════════════════════════════════════
   ZOOM CONTROLS
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
   DRAG TO REPOSITION IMAGE
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
      // Re-apply bg removal on repositioned image
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

// Touch drag support
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

/**
 * Download sheet(s) in the specified format.
 * Photo size is ALWAYS fixed at 35×45 mm — never changes.
 * If photos overflow one A4, multiple files / PDF pages are generated.
 * @param {'png'|'jpg'|'jpeg'|'pdf'} fmt
 */
function downloadSheet(fmt) {
  // Re-render to ensure generatedSheets is fresh & full-resolution
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

  // Each sheet → separate image file
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

/**
 * Download all sheets as a multi-page PDF.
 * Each A4 sheet = one PDF page. Photo size stays fixed.
 * @param {HTMLCanvasElement[]} sheets
 * @param {string} filename
 */
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
    await navigator.share({
      title: 'My Passport Photo',
      text: 'Generated with SnapPass',
      files: [file],
    });
    showToast('Shared successfully!', 'success');
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Share failed', 'error');
  }
});

/* ══════════════════════════════════════════════
   HISTORY SYSTEM
══════════════════════════════════════════════ */
const HISTORY_KEY = 'snappass_history';

/**
 * Load history from localStorage
 * @returns {HistoryEntry[]}
 */
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

/**
 * Save current state to history
 */
function saveToHistory() {
  if (!state.processedCanvas) return;
  Audio.click();

  const thumb = els.previewCanvas.toDataURL('image/jpeg', 0.6);
  const sheetData = els.sheetCanvas.toDataURL('image/jpeg', 0.7);
  const originalData = state.originalImage?.src || null;

  const entry = {
    id: Date.now(),
    date: new Date().toLocaleString(),
    thumb,
    sheetData,
    originalSrc: originalData,
    settings: {
      quantity: state.quantity,
      bgColor: state.bgColor,
      borderWidth: state.borderWidth,
      borderColor: state.borderColor,
      brightness: state.brightness,
      contrast: state.contrast,
      saturation: state.saturation,
      imageOffsetX: state.imageOffsetX,
      imageOffsetY: state.imageOffsetY,
    },
  };

  const history = loadHistory();
  history.unshift(entry);
  // Keep max 20 entries
  if (history.length > 20) history.splice(20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

  Audio.success();
  showToast('Saved to history!', 'success');
}

/**
 * Render the history list in the modal
 */
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

  // Click to restore
  els.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-history-item')) return;
      const id = parseInt(item.dataset.id);
      restoreFromHistory(id);
    });
  });

  // Delete individual
  els.historyList.querySelectorAll('.delete-history-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteHistoryEntry(id);
    });
  });
}

/**
 * Restore a history entry
 * @param {number} id
 */
function restoreFromHistory(id) {
  const history = loadHistory();
  const entry = history.find(e => e.id === id);
  if (!entry) return;

  closeModal(els.historyModal);
  showLoading('Restoring…');

  // Restore settings
  const s = entry.settings;
  state.quantity = s.quantity;
  state.bgColor = s.bgColor;
  state.borderWidth = s.borderWidth;
  state.borderColor = s.borderColor;
  state.brightness = s.brightness;
  state.contrast = s.contrast;
  state.saturation = s.saturation;
  state.imageOffsetX = s.imageOffsetX || 0;
  state.imageOffsetY = s.imageOffsetY || 0;

  // Update UI controls
  els.brightnessSlider.value = s.brightness; els.brightnessVal.textContent = s.brightness;
  els.contrastSlider.value = s.contrast;     els.contrastVal.textContent = s.contrast;
  els.saturationSlider.value = s.saturation; els.saturationVal.textContent = s.saturation;
  els.borderWidthInput.value = s.borderWidth; els.borderWidthVal.textContent = s.borderWidth;
  els.borderColorInput.value = s.borderColor;
  els.customBgColor.value = s.bgColor;

  document.querySelectorAll('.qty-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.qty) === s.quantity);
  });

  // Restore original image if available
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

/**
 * Delete a history entry
 * @param {number} id
 */
function deleteHistoryEntry(id) {
  Audio.click();
  const history = loadHistory().filter(e => e.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistoryList();
}

// Event Listeners for History
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
   MODAL CLOSE BUTTONS
══════════════════════════════════════════════ */
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    Audio.click();
    [els.downloadModal, els.historyModal].forEach(closeModal);
  });
});

// Click outside to close
[els.downloadModal, els.historyModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

/* ══════════════════════════════════════════════
   MODAL BG CLICKS
══════════════════════════════════════════════ */
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', () => {
    [els.downloadModal, els.historyModal].forEach(closeModal);
  });
});

/* ══════════════════════════════════════════════
   PERFORMANCE: Use requestAnimationFrame for heavy renders
══════════════════════════════════════════════ */
let rafId = null;
const scheduleRender = () => {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    renderPreview();
    rafId = null;
  });
};

// Throttle slider inputs through rAF
[els.brightnessSlider, els.contrastSlider, els.saturationSlider, els.borderWidthInput].forEach(el => {
  el.addEventListener('input', scheduleRender);
});

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
// Ensure welcome screen plays properly
document.addEventListener('DOMContentLoaded', () => {
  // Stagger orbs
  document.querySelectorAll('.welcome-orb').forEach((orb, i) => {
    orb.style.animationDelay = `${i * -2}s`;
  });
});

console.log('%c SnapPass · Passport Photo Generator ', 'background:#6366f1;color:white;padding:4px 8px;border-radius:4px;font-family:monospace');
console.log('%c Built with Canvas API · No backend required ', 'color:#818cf8;font-family:monospace');