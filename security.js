/**
 * SnapPass · Security, Developer & Subscription System v2
 * ═══════════════════════════════════════════════════════
 * Changes v2:
 *  - First login → payment = "Active" sheet me save
 *  - Refresh = no password ask; new tab = password ask
 *  - Check Subscription btn: 31 days tak hidden, baad mein show
 *  - Payment empty → upload block + red msg
 *  - Subscription info: kb liya, kb end, kitne din baaki + progress bar
 *  - Professional developer skills
 */

"use strict";

/* ══════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════ */
const SECURITY_CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxbI0r9nZq2_xO2Vhdj4edJ_lzpYF7VQd194k_zJPF64_4UZyYRXOSLh51DMG2M7vveuA/exec',
  DEVELOPER: {
    name: 'Shaikh Salik',
    roles: [
      'Website Designer',
      'Web Developer',
      'Graphic Designer',
      'AI Handler',
      'UI/UX Designer',
      'SEO Specialist',
      'Brand Identity Designer',
      'Social Media Manager',
      'Digital Marketing Expert',
      'Video Editor',
    ],
    phone: '7069331761',
    upi: 'shaikh.salik@fam',
    whatsapp: '917069331761',
    subscriptionPrice: 499,
    subscriptionDays: 31,
  },
};

/* ══════════════════════════════════════════════
   STORAGE KEYS
══════════════════════════════════════════════ */
const SEC_KEYS = {
  PASSWORD:     'snappass_password',
  ACCESS_CODE:  'snappass_access_code',
  SUB_START:    'snappass_sub_start',
  SUB_END:      'snappass_sub_end',
  SUB_ACTIVE:   'snappass_sub_active',
  SESSION_FLAG: 'snappass_tab_session', // sessionStorage — clears on tab close
};

/* ══════════════════════════════════════════════
   STORAGE HELPERS
══════════════════════════════════════════════ */
function lsSet(k, v) { localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); }
function lsGet(k)    { const v = localStorage.getItem(k); try { return JSON.parse(v); } catch { return v; } }
function ssSet(k, v) { sessionStorage.setItem(k, v); }
function ssGet(k)    { return sessionStorage.getItem(k); }

/* ══════════════════════════════════════════════
   WELCOME SOUND
══════════════════════════════════════════════ */
function playWelcomeSound() {
  try {
    const ctx   = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.4);
    });
  } catch (_) {}
}

/* ══════════════════════════════════════════════
   SHEET API (Improved with better error handling)
══════════════════════════════════════════════ */
async function sheetFetch(params) {
  const url = SECURITY_CONFIG.SCRIPT_URL + '?' + new URLSearchParams(params).toString();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    console.error('sheetFetch error:', err);
    throw err;   // re-throw taaki original error dikhe
  }
}

async function sheetPost(body) {
  try {
    const res = await fetch(SECURITY_CONFIG.SCRIPT_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'text/plain;charset=utf-8'   // yeh important hai
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'Invalid JSON response' };
    }

    return data;

  } catch (err) {
    console.error('sheetPost failed:', err);
    // Better error message for user
    throw new Error('Server connection failed. Please try again.');
  }
}

/* ══════════════════════════════════════════════
   REAL-TIME DATE (Date manipulation protection)
   Multiple free time APIs use karta hai — ek fail ho toh doosra
══════════════════════════════════════════════ */
async function getRealTime() {
  const apis = [
    async () => {
      const r = await fetch('https://worldtimeapi.org/api/ip', { cache: 'no-store' });
      const d = await r.json();
      return new Date(d.utc_datetime).getTime();
    },
    async () => {
      const r = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Kolkata', { cache: 'no-store' });
      const d = await r.json();
      return new Date(d.dateTime).getTime();
    },
    async () => {
      // Google Apps Script se time lena (already connected hai)
      const url = SECURITY_CONFIG.SCRIPT_URL + '?action=getTime';
      const r = await fetch(url, { cache: 'no-store' });
      const d = await r.json();
      return d.time ? parseInt(d.time) : null;
    }
  ];

  for (const api of apis) {
    try {
      const t = await api();
      if (t && t > 0) {
        console.log('Real time fetched:', new Date(t).toISOString());
        return t;
      }
    } catch (e) {
      console.warn('Time API failed, trying next...', e.message);
    }
  }
  // Sab fail — device time use karo (last resort)
  console.warn('All time APIs failed, using device time');
  return Date.now();
}

async function checkSubWithRealTime() {
  const start  = lsGet(SEC_KEYS.SUB_START);
  const end    = lsGet(SEC_KEYS.SUB_END);
  const active = lsGet(SEC_KEYS.SUB_ACTIVE);

  if (!start || !end || active !== 'yes') return false;

  try {
    const realNow = await getRealTime();
    const endMs   = parseInt(end);
    const isValid = realNow < endMs;

    if (!isValid) {
      // Subscription expired — locally bhi mark karo
      lsSet(SEC_KEYS.SUB_ACTIVE, 'expired');
      console.warn('Subscription expired (real time check)');
    }
    return isValid;
  } catch {
    // Time check fail — local time se fallback
    return Date.now() < parseInt(end);
  }
}

/* ══════════════════════════════════════════════
   SUBSCRIPTION HELPERS
══════════════════════════════════════════════ */
function getSubInfo() {
  const start  = lsGet(SEC_KEYS.SUB_START);
  const end    = lsGet(SEC_KEYS.SUB_END);
  const active = lsGet(SEC_KEYS.SUB_ACTIVE);
  const now    = Date.now();

  if (!start || !end || active !== 'yes') {
    return { isActive: false, daysLeft: 0, startDate: null, endDate: null, everHadSub: !!start };
  }

  const endMs    = parseInt(end);
  const daysLeft = Math.max(0, Math.ceil((endMs - now) / 86400000));
  const startDate = new Date(parseInt(start)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const endDate   = new Date(endMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return { isActive: now < endMs, daysLeft, startDate, endDate, everHadSub: true };
}

function activateSubscriptionLocally() {
  const now    = Date.now();
  const subEnd = now + (31 * 24 * 60 * 60 * 1000);
  lsSet(SEC_KEYS.SUB_START,  now);
  lsSet(SEC_KEYS.SUB_END,    subEnd);
  lsSet(SEC_KEYS.SUB_ACTIVE, 'yes');
}

/* ══════════════════════════════════════════════
   CSS INJECTION
══════════════════════════════════════════════ */
function injectSecurityStyles() {
  document.head.insertAdjacentHTML('beforeend', `<style id="sec-styles">
  /* ── Orbs ── */
  .sec-orb{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;}
  .sec-orb1{width:400px;height:400px;background:rgba(99,102,241,.12);top:-100px;left:-100px;animation:orbFloat 10s ease-in-out infinite alternate;}
  .sec-orb2{width:300px;height:300px;background:rgba(139,92,246,.10);bottom:-50px;right:-50px;animation:orbFloat 10s ease-in-out infinite alternate;animation-delay:-4s;}

  /* ── Login Panel ── */
  .sec-panel{position:relative;z-index:1;background:rgba(255,255,255,.04);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.09);border-radius:28px;padding:36px 32px;width:100%;max-width:380px;margin:0 16px;animation:modalPop .4s cubic-bezier(.34,1.56,.64,1) forwards;}
  .sec-logo-wrap{display:flex;justify-content:center;margin-bottom:14px;}
  .sec-title{font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;text-align:center;margin-bottom:6px;letter-spacing:-.5px;}
  .sec-subtitle{color:rgba(255,255,255,.4);text-align:center;font-size:.9rem;margin-bottom:28px;}
  .sec-gradient{background:linear-gradient(135deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  .sec-field-group{margin-bottom:16px;}
  .sec-label{display:block;font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:7px;letter-spacing:.02em;}
  .sec-input{width:100%;padding:12px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;color:white;font-size:.95rem;outline:none;transition:border-color .2s,background .2s;font-family:'DM Sans',sans-serif;}
  .sec-input:focus{border-color:rgba(99,102,241,.5);background:rgba(99,102,241,.06);}
  .sec-input::placeholder{color:rgba(255,255,255,.2);}
  .sec-pw-wrap{position:relative;}
  .sec-pw-wrap .sec-input{padding-right:48px;}
  .sec-eye-btn{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:rgba(255,255,255,.4);padding:4px;display:flex;align-items:center;transition:color .2s;}
  .sec-eye-btn:hover{color:rgba(255,255,255,.8);}
  .sec-error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);border-radius:10px;padding:10px 14px;font-size:.83rem;color:#fca5a5;margin-bottom:14px;text-align:center;}
  .sec-btn-primary{width:100%;padding:13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:14px;color:white;font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;cursor:pointer;transition:opacity .2s,transform .15s;box-shadow:0 4px 20px rgba(99,102,241,.35);display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;}
  .sec-btn-primary:hover{opacity:.9;transform:translateY(-1px);}
  .sec-btn-primary:active{transform:scale(.97);}
  .sec-btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none;}
  .sec-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;}
  .sec-hint{text-align:center;font-size:.78rem;color:rgba(255,255,255,.2);}

  /* ── Developer Panel ── */
  .dev-panel{position:fixed;top:0;right:0;height:100vh;width:320px;max-width:90vw;background:rgba(10,10,18,.98);backdrop-filter:blur(24px);border-left:1px solid rgba(255,255,255,.09);transition:transform .38s cubic-bezier(.4,0,.2,1);pointer-events:all;overflow-y:auto;z-index:998;}
  #dev-panel-overlay.open .dev-panel{transform:translateX(0) !important;}
  .dev-panel-inner{padding:28px 22px;}
  .dev-panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;}
  .dev-panel-title{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;color:white;}
  .dev-close-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);width:30px;height:30px;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;}
  .dev-close-btn:hover{background:rgba(255,255,255,.12);color:white;}
  .dev-avatar-wrap{display:flex;align-items:flex-start;gap:14px;margin-bottom:24px;}
  .dev-avatar{width:54px;height:54px;border-radius:16px;flex-shrink:0;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;color:white;box-shadow:0 4px 20px rgba(99,102,241,.4);}
  .dev-name{font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:white;margin-bottom:8px;}
  .dev-roles{display:flex;flex-wrap:wrap;gap:5px;}
  .dev-role-badge{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.25);border-radius:6px;padding:3px 8px;font-size:.67rem;color:#a5b4fc;line-height:1.4;}
  .dev-info-section{margin-bottom:20px;border-top:1px solid rgba(255,255,255,.06);padding-top:18px;}
  .dev-section-label{font-size:.69rem;color:rgba(255,255,255,.3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:13px;}
  .dev-info-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
  .dev-info-icon{font-size:.9rem;flex-shrink:0;width:22px;text-align:center;}
  .dev-info-text{flex:1;font-size:.85rem;color:rgba(255,255,255,.7);}
  .upi-text{font-family:monospace;font-size:.79rem;}
  .dev-action-btn{display:flex;align-items:center;gap:5px;padding:5px 11px;border-radius:8px;font-size:.74rem;font-weight:600;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.25);color:#a5b4fc;cursor:pointer;text-decoration:none;transition:all .2s;flex-shrink:0;}
  .dev-action-btn:hover{background:rgba(99,102,241,.28);}
  .dev-wa-btn{background:rgba(37,211,102,.12);border-color:rgba(37,211,102,.25);color:#6ee7b7;}
  .dev-wa-btn:hover{background:rgba(37,211,102,.22);}
  .dev-sub-desc{font-size:.8rem;color:rgba(255,255,255,.4);margin-bottom:14px;line-height:1.55;}
  .dev-pay-btn{width:100%;padding:12px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:white;font-weight:700;font-size:.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .2s,transform .15s;margin-bottom:12px;box-shadow:0 4px 16px rgba(99,102,241,.35);font-family:'DM Sans',sans-serif;}
  .dev-pay-btn:hover{opacity:.9;transform:translateY(-1px);}
  .dev-pay-note{font-size:.73rem;color:rgba(255,255,255,.35);text-align:center;margin-bottom:12px;line-height:1.55;}
  .dev-wa-pay-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px 16px;border-radius:12px;background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.25);color:#6ee7b7;font-size:.81rem;font-weight:600;text-decoration:none;transition:all .2s;font-family:'DM Sans',sans-serif;}
  .dev-wa-pay-btn:hover{background:rgba(37,211,102,.22);}
  .dev-check-btn{width:100%;padding:11px;border-radius:12px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);color:#a5b4fc;font-size:.84rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;font-family:'DM Sans',sans-serif;margin-top:10px;}
  .dev-check-btn:hover{background:rgba(99,102,241,.22);}
  .dev-check-btn.hidden{display:none !important;}
  .dev-sub-status-box{border-radius:12px;padding:14px 16px;font-size:.83rem;line-height:1.65;}
  .sub-active{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.22);color:#86efac;}
  .sub-expired{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.22);color:#fca5a5;}
  .sub-none{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.5);}
  .sub-days-bar{width:100%;height:5px;background:rgba(255,255,255,.08);border-radius:99px;margin-top:10px;overflow:hidden;}
  .sub-days-fill{height:100%;background:linear-gradient(90deg,#6366f1,#22c55e);border-radius:99px;transition:width .6s ease;}

  /* ── Header dev btn ── */
  #dev-info-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);cursor:pointer;transition:background .2s,border-color .2s,transform .15s;}
  #dev-info-btn:hover{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.15);transform:translateY(-1px);}

  /* ── Expired banner ── */
  #sub-expired-banner{position:fixed;top:0;left:0;right:0;z-index:200;background:linear-gradient(90deg,rgba(239,68,68,.95),rgba(185,28,28,.95));padding:10px 20px;text-align:center;font-size:.83rem;color:white;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;}
  .banner-renew-btn{padding:4px 12px;background:white;color:#dc2626;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:.77rem;}

  @media(max-width:400px){.sec-panel{padding:28px 18px;}.dev-panel{width:100%;max-width:100vw;}}
  </style>`);
}

/* ══════════════════════════════════════════════
   HTML INJECTION
══════════════════════════════════════════════ */
function injectSecurityPanels() {
  const svgLogo = (a, b) => `
    <svg width="52" height="52" viewBox="0 0 72 72" fill="none">
      <rect width="72" height="72" rx="20" fill="url(#${a})"/>
      <rect x="22" y="18" width="28" height="36" rx="3" fill="white" fill-opacity="0.9"/>
      <circle cx="36" cy="30" r="7" fill="url(#${b})"/>
      <path d="M24 50c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="url(#${b})" stroke-width="2.5" stroke-linecap="round"/>
      <defs>
        <linearGradient id="${a}" x1="0" y1="0" x2="72" y2="72"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient>
        <linearGradient id="${b}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient>
      </defs>
    </svg>`;

  const eyes = `
    <svg class="eye-open" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    <svg class="eye-closed hidden" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  const d = SECURITY_CONFIG.DEVELOPER;

  document.body.insertAdjacentHTML('beforeend', `
  <!-- ══ LOCK OVERLAY ══ -->
  <div id="sec-lock-overlay" class="fixed inset-0 z-[999] flex items-center justify-center" style="background:#08080e;">
    <div class="sec-orb sec-orb1"></div>
    <div class="sec-orb sec-orb2"></div>

    <!-- NEW USER -->
    <div id="sec-login-panel" class="sec-panel hidden">
      <div class="sec-logo-wrap">${svgLogo('slg1','slg2')}</div>
      <h2 class="sec-title"><span class="sec-gradient">Snap</span>Pass</h2>
      <p class="sec-subtitle">Enter your Access Code to get started</p>
      <div class="sec-field-group">
        <label class="sec-label">Access Code</label>
        <input id="sec-access-input" type="text" placeholder="e.g. SP-2024-XXXX" class="sec-input" autocomplete="off"/>
      </div>
      <div class="sec-field-group">
        <label class="sec-label">Create Password</label>
        <div class="sec-pw-wrap">
          <input id="sec-newpw-input" type="password" placeholder="Create your password" class="sec-input" autocomplete="new-password"/>
          <button class="sec-eye-btn" data-target="sec-newpw-input" type="button">${eyes}</button>
        </div>
      </div>
      <div id="sec-login-err" class="sec-error hidden"></div>
      <button id="sec-login-btn" class="sec-btn-primary">
        <span id="sec-login-btn-text">Login →</span>
        <span id="sec-login-spinner" class="sec-spinner hidden"></span>
      </button>
      <p class="sec-hint">Contact developer to get your Access Code</p>
    </div>

    <!-- RETURNING USER -->
    <div id="sec-pw-panel" class="sec-panel hidden">
      <div class="sec-logo-wrap">${svgLogo('slg3','slg4')}</div>
      <h2 class="sec-title"><span class="sec-gradient">Snap</span>Pass</h2>
      <p class="sec-subtitle">Welcome back! Enter your password</p>
      <div class="sec-field-group">
        <label class="sec-label">Password</label>
        <div class="sec-pw-wrap">
          <input id="sec-pw-input" type="password" placeholder="Enter your password" class="sec-input" autocomplete="current-password"/>
          <button class="sec-eye-btn" data-target="sec-pw-input" type="button">${eyes}</button>
        </div>
      </div>
      <div id="sec-pw-err" class="sec-error hidden"></div>
      <button id="sec-pw-submit-btn" class="sec-btn-primary">
        <span id="sec-pw-btn-text">Unlock →</span>
        <span id="sec-pw-spinner" class="sec-spinner hidden"></span>
      </button>
      <p class="sec-hint">Forgot password? Contact the developer</p>
    </div>
  </div>

  <!-- ══ DEVELOPER PANEL ══ -->
  <div id="dev-panel-overlay" class="fixed inset-0 z-[998] pointer-events-none">
    <div id="dev-panel" class="dev-panel" style="transform:translateX(100%);">
      <div class="dev-panel-inner">

        <div class="dev-panel-header">
          <h3 class="dev-panel-title">About Developer</h3>
          <button id="dev-panel-close" class="dev-close-btn">✕</button>
        </div>

        <div class="dev-avatar-wrap">
          <div class="dev-avatar">SS</div>
          <div>
            <p class="dev-name">${d.name}</p>
            <div class="dev-roles">
              ${d.roles.map(r => `<span class="dev-role-badge">${r}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="dev-info-section">
          <p class="dev-section-label">Contact</p>
          <div class="dev-info-row">
            <span class="dev-info-icon">📞</span>
            <span class="dev-info-text">${d.phone}</span>
            <a href="tel:+91${d.phone}" class="dev-action-btn">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/></svg>
              Dial
            </a>
          </div>
          <div class="dev-info-row">
            <span class="dev-info-icon">💬</span>
            <span class="dev-info-text">WhatsApp</span>
            <a id="dev-whatsapp-btn" href="#" target="_blank" class="dev-action-btn dev-wa-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.532 5.847L.057 23.997l6.29-1.648A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.81 9.81 0 01-5.002-1.368l-.359-.213-3.732.977.999-3.641-.234-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
              Chat
            </a>
          </div>
          <div class="dev-info-row">
            <span class="dev-info-icon">💳</span>
            <span class="dev-info-text upi-text">${d.upi}</span>
            <button id="dev-copy-upi-btn" class="dev-action-btn">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Copy
            </button>
          </div>
        </div>

        <div class="dev-info-section">
          <p class="dev-section-label">Subscription — ₹${d.subscriptionPrice}/month</p>
          <p class="dev-sub-desc">${d.subscriptionDays} days access · Unlimited photo processing · Print-ready downloads</p>
          <button id="dev-pay-upi-btn" class="dev-pay-btn">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            Purchase Subscription via UPI
          </button>
          <p class="dev-pay-note">After payment, message the developer with your Access Code to activate</p>
          <a id="dev-wa-after-pay" href="#" target="_blank" class="dev-wa-pay-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.532 5.847L.057 23.997l6.29-1.648A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.81 9.81 0 01-5.002-1.368l-.359-.213-3.732.977.999-3.641-.234-.374A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
            Message on WhatsApp after Payment
          </a>
        </div>

        <div id="dev-sub-status-section" class="dev-info-section">
          <p class="dev-section-label">Your Subscription</p>
          <div id="dev-sub-status-box" class="dev-sub-status-box sub-none">
            <span style="font-size:.83rem">Loading subscription info…</span>
          </div>
          <button id="dev-check-sub-btn" class="dev-check-btn hidden">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
            Check &amp; Renew Subscription
          </button>
        </div>

      </div>
    </div>
  </div>
  `);
}

/* ══════════════════════════════════════════════
   MAIN INIT
══════════════════════════════════════════════ */
async function initSecurity() {
  injectSecurityStyles();
  injectSecurityPanels();
  setTimeout(playWelcomeSound, 300);

  const savedPassword = lsGet(SEC_KEYS.PASSWORD);
  const tabActive     = ssGet(SEC_KEYS.SESSION_FLAG); // lives only for this tab

  if (savedPassword && tabActive) {
    // Refresh in same tab — don't ask password
    hideLockOverlay();
    afterLoginSetup();
    return;
  }

  if (savedPassword) {
    // New tab opened — ask password again
    showPanel('sec-pw-panel');
    setupPasswordPanel(savedPassword);
  } else {
    // Brand new user
    showPanel('sec-login-panel');
    setupLoginPanel();
  }

  setupEyeButtons();
}

/* ══════════════════════════════════════════════
   AFTER LOGIN
══════════════════════════════════════════════ */
function afterLoginSetup() {
  injectDevButton();
  setupDevPanel();
  refreshSubStatusUI();
  enforceSubscription();
}

/* ══════════════════════════════════════════════
   PANEL MANAGEMENT
══════════════════════════════════════════════ */
function showPanel(id) {
  document.getElementById('sec-lock-overlay').classList.remove('hidden');
  ['sec-login-panel', 'sec-pw-panel'].forEach(p =>
    document.getElementById(p).classList.add('hidden')
  );
  document.getElementById(id).classList.remove('hidden');
}

function hideLockOverlay() {
  const el = document.getElementById('sec-lock-overlay');
  if (!el) return;
  el.style.transition = 'opacity 0.5s ease';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 520);
}

/* ══════════════════════════════════════════════
   NEW USER — Access Code + Password Login
══════════════════════════════════════════════ */
function setupLoginPanel() {
  const btn     = document.getElementById('sec-login-btn');
  const aInput  = document.getElementById('sec-access-input');
  const pwInput = document.getElementById('sec-newpw-input');
  const errEl   = document.getElementById('sec-login-err');

  const doLogin = async () => {
    const code = aInput.value.trim();
    const pw   = pwInput.value.trim();

    if (!code || !pw) { showSecError(errEl, 'Please fill in both fields'); return; }
    if (pw.length < 4) { showSecError(errEl, 'Password must be at least 4 characters'); return; }

    setSecLoading(btn, 'sec-login-btn-text', 'sec-login-spinner', true);

    try {
      const data = await sheetFetch({ action: 'checkCode', code });

      if (!data.found) {
        showSecError(errEl, 'Invalid Access Code. Please check and try again.');
        setSecLoading(btn, 'sec-login-btn-text', 'sec-login-spinner', false);
        return;
      }
      if (data.status && data.status.toLowerCase() === 'active') {
        showSecError(errEl, 'This Access Code is already in use. Contact the developer.');
        setSecLoading(btn, 'sec-login-btn-text', 'sec-login-spinner', false);
        return;
      }

      // Save to sheet: password + Status=Active + Payment=Active
      await sheetPost({ action: 'activate', code, password: pw });

      lsSet(SEC_KEYS.PASSWORD,    pw);
      lsSet(SEC_KEYS.ACCESS_CODE, code);
      activateSubscriptionLocally();
      ssSet(SEC_KEYS.SESSION_FLAG, '1');

      hideLockOverlay();
      afterLoginSetup();

    } catch {
      showSecError(errEl, 'Connection error. Check your internet and try again.');
      setSecLoading(btn, 'sec-login-btn-text', 'sec-login-spinner', false);
    }
  };

  btn.addEventListener('click', doLogin);
  [aInput, pwInput].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
}

/* ══════════════════════════════════════════════
   RETURNING USER — Password
══════════════════════════════════════════════ */
function setupPasswordPanel(savedPw) {
  const btn     = document.getElementById('sec-pw-submit-btn');
  const pwInput = document.getElementById('sec-pw-input');
  const errEl   = document.getElementById('sec-pw-err');

  const doUnlock = () => {
    const entered = pwInput.value.trim();
    if (!entered) { showSecError(errEl, 'Please enter your password'); return; }
    if (entered !== savedPw) {
      showSecError(errEl, 'Wrong password. Please try again.');
      pwInput.value = ''; pwInput.focus(); return;
    }
    ssSet(SEC_KEYS.SESSION_FLAG, '1');
    hideLockOverlay();
    afterLoginSetup();
  };

  btn.addEventListener('click', doUnlock);
  pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
}

/* ══════════════════════════════════════════════
   EYE TOGGLE
══════════════════════════════════════════════ */
function setupEyeButtons() {
  document.querySelectorAll('.sec-eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const hide  = input.type === 'password';
      input.type  = hide ? 'text' : 'password';
      btn.querySelector('.eye-open').classList.toggle('hidden', hide);
      btn.querySelector('.eye-closed').classList.toggle('hidden', !hide);
    });
  });
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function showSecError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}
function setSecLoading(btn, tId, sId, on) {
  btn.disabled = on;
  document.getElementById(tId).classList.toggle('hidden', on);
  document.getElementById(sId).classList.toggle('hidden', !on);
}

/* ══════════════════════════════════════════════
   SUBSCRIPTION UI
══════════════════════════════════════════════ */
function refreshSubStatusUI() {
  const info     = getSubInfo();
  const box      = document.getElementById('dev-sub-status-box');
  const checkBtn = document.getElementById('dev-check-sub-btn');
  if (!box) return;

  if (info.isActive) {
    const pct = Math.min(100, Math.round((info.daysLeft / 31) * 100));
    box.className = 'dev-sub-status-box sub-active';
    box.innerHTML = `
      ✅ <strong>Subscription Active</strong><br>
      <span style="font-size:.77rem;opacity:.9">
        📅 Started: ${info.startDate}<br>
        🏁 Ends on: ${info.endDate}<br>
        🗓️ <strong>${info.daysLeft} day${info.daysLeft !== 1 ? 's' : ''} remaining</strong>
      </span>
      <div class="sub-days-bar"><div class="sub-days-fill" style="width:${pct}%"></div></div>`;
    if (checkBtn) checkBtn.classList.add('hidden'); // hidden while active

  } else if (info.everHadSub) {
    box.className = 'dev-sub-status-box sub-expired';
    box.innerHTML = `
      ❌ <strong>Subscription Expired</strong><br>
      <span style="font-size:.77rem;opacity:.9">
        📅 Was active: ${info.startDate || '—'}<br>
        🏁 Ended on: ${info.endDate || '—'}<br>
        Renew to continue uploading photos.
      </span>`;
    if (checkBtn) checkBtn.classList.remove('hidden'); // show after expiry

  } else {
    box.className = 'dev-sub-status-box sub-none';
    box.innerHTML = `<span style="font-size:.83rem">No subscription found.<br>Purchase to activate your account.</span>`;
    if (checkBtn) checkBtn.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════
   ENFORCE SUBSCRIPTION (Real-time date check)
══════════════════════════════════════════════ */
async function enforceSubscription() {
  const info = getSubInfo();

  // Pehle local check — agar already expired hai toh seedha block
  if (!info.isActive && info.everHadSub) {
    blockImageUpload();
    showExpiredBanner();
    return;
  }

  // Agar locally active hai — real time se verify karo (date manipulation catch)
  if (info.isActive) {
    try {
      const reallyActive = await checkSubWithRealTime();
      if (!reallyActive) {
        blockImageUpload();
        showExpiredBanner();
        if (typeof showToast === 'function')
          showToast('⚠️ Subscription expired. Date change detect hui.', 'error');
      }
    } catch {
      // Time API fail — locally active hai toh allow karo
    }
  }
}

function blockImageUpload() {
  const fi = document.getElementById('file-input');
  const dz = document.getElementById('drop-zone');

  if (fi) fi.disabled = true;

  // Drop zone pe overlay lagao
  if (dz && !document.getElementById('upload-block-overlay')) {
    dz.style.position = 'relative';
    const overlay = document.createElement('div');
    overlay.id = 'upload-block-overlay';
    overlay.style.cssText = `
      position:absolute;inset:0;z-index:10;border-radius:24px;
      background:rgba(10,10,15,0.82);backdrop-filter:blur(6px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
      cursor:not-allowed;
    `;
    overlay.innerHTML = \`
      <span style="font-size:2.2rem">🔒</span>
      <p style="color:#fca5a5;font-weight:700;font-size:1rem;font-family:'Syne',sans-serif;">Subscription Expired</p>
      <p style="color:rgba(255,255,255,.5);font-size:.8rem;text-align:center;padding:0 20px;">Renew your subscription to upload photos</p>
      <button onclick="openDevPanel()" style="margin-top:6px;padding:8px 20px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:white;font-weight:700;cursor:pointer;font-size:.85rem;">Renew Now</button>
    \`;
    dz.appendChild(overlay);
  }

  const msg = () => { if (typeof showToast === 'function') showToast('🔒 Subscription expired. Renew to upload photos.', 'error'); };
  if (dz) {
    dz.addEventListener('drop',  e => { e.preventDefault(); e.stopPropagation(); msg(); }, true);
  }
}

function showExpiredBanner() {
  if (document.getElementById('sub-expired-banner')) return;
  const b = document.createElement('div');
  b.id = 'sub-expired-banner';
  b.innerHTML = `⚠️ Your subscription has expired. Renew to upload photos.
    <button class="banner-renew-btn" onclick="openDevPanel()">Renew Now</button>`;
  document.body.prepend(b);
}

function removeExpiredBanner() {
  const b = document.getElementById('sub-expired-banner');
  if (b) b.remove();
}

/* ══════════════════════════════════════════════
   DEVELOPER BUTTON
══════════════════════════════════════════════ */
function injectDevButton() {
  if (document.getElementById('dev-info-btn')) return;
  const histBtn = document.getElementById('history-btn');
  if (!histBtn) return;

  const btn = document.createElement('button');
  btn.id = 'dev-info-btn';
  btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/80 hover:text-white transition-all';
  btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>Developer`;
  histBtn.parentNode.insertBefore(btn, histBtn.nextSibling);
  btn.addEventListener('click', openDevPanel);
}

function openDevPanel() {
  const overlay = document.getElementById('dev-panel-overlay');
  const panel   = document.getElementById('dev-panel');
  if (!overlay || !panel) return;
  overlay.classList.add('open');
  panel.style.transform = 'translateX(0)';
  updateWhatsAppLinks(lsGet(SEC_KEYS.ACCESS_CODE) || 'YOUR_CODE');
  refreshSubStatusUI();
}

/* ══════════════════════════════════════════════
   DEV PANEL EVENTS
══════════════════════════════════════════════ */
function setupDevPanel() {
  document.getElementById('dev-panel-close').addEventListener('click', closeDevPanel);
  document.getElementById('dev-panel-overlay').addEventListener('click', e => {
    if (e.target.id === 'dev-panel-overlay') closeDevPanel();
  });

  // Copy UPI
  document.getElementById('dev-copy-upi-btn').addEventListener('click', () => {
    const upi = SECURITY_CONFIG.DEVELOPER.upi;
    const copy = () => { const t = document.createElement('textarea'); t.value = upi; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); };
    if (navigator.clipboard) navigator.clipboard.writeText(upi).then(() => {}).catch(copy);
    else copy();
    if (typeof showToast === 'function') showToast('UPI ID copied! 📋', 'success');
  });

  // Pay via UPI
  document.getElementById('dev-pay-upi-btn').addEventListener('click', () => {
    const d = SECURITY_CONFIG.DEVELOPER;
    window.location.href = `upi://pay?pa=${d.upi}&pn=${encodeURIComponent(d.name)}&am=${d.subscriptionPrice}&cu=INR&tn=${encodeURIComponent('SnapPass Subscription')}`;
  });

  // Check subscription
  document.getElementById('dev-check-sub-btn').addEventListener('click', checkSubscriptionFromSheet);
}

function closeDevPanel() {
  const p = document.getElementById('dev-panel');
  const o = document.getElementById('dev-panel-overlay');
  if (p) p.style.transform = 'translateX(100%)';
  if (o) setTimeout(() => o.classList.remove('open'), 390);
}

function updateWhatsAppLinks(code) {
  const d   = SECURITY_CONFIG.DEVELOPER;
  const msg = encodeURIComponent(`${code} mene subscription purchase kr liya he`);
  const url = `https://wa.me/${d.whatsapp}?text=${msg}`;
  const a1  = document.getElementById('dev-whatsapp-btn');
  const a2  = document.getElementById('dev-wa-after-pay');
  if (a1) a1.href = url;
  if (a2) a2.href = url;
}

/* ══════════════════════════════════════════════
   CHECK SUBSCRIPTION FROM SHEET
══════════════════════════════════════════════ */
async function checkSubscriptionFromSheet() {
  const btn  = document.getElementById('dev-check-sub-btn');
  const box  = document.getElementById('dev-sub-status-box');
  const code = lsGet(SEC_KEYS.ACCESS_CODE);

  if (!code) {
    box.className = 'dev-sub-status-box sub-expired';
    box.textContent = 'No access code found. Please login again.';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="sec-spinner" style="width:14px;height:14px;border-width:2px;"></span> Checking…`;

  try {
    const data = await sheetFetch({ action: 'checkPayment', code });

    if (data.payment && data.payment.toLowerCase() === 'yes') {
      activateSubscriptionLocally();
      removeExpiredBanner();

      // Re-enable file input (drop listeners need page reload to fully remove)
      const fi = document.getElementById('file-input');
      if (fi) fi.disabled = false;

      btn.classList.add('hidden'); // hide for next 31 days
      refreshSubStatusUI();

      if (typeof showToast === 'function')
        showToast('🎉 Subscription activated! 31 days unlocked.', 'success');

    } else {
      // Payment empty / not confirmed
      box.className = 'dev-sub-status-box sub-expired';
      box.innerHTML = `
        ❌ <strong>Subscription Not Active</strong><br>
        <span style="font-size:.77rem;opacity:.9">
          Payment not confirmed yet.<br>
          Complete payment and contact developer to activate.
        </span>`;
    }
  } catch {
    box.className = 'dev-sub-status-box sub-expired';
    box.textContent = 'Connection error. Check internet and try again.';
  }

  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>Check &amp; Renew Subscription`;
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', initSecurity);