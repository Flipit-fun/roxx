/* ============================================================
   APOGEE — scroll-driven camera-move controller
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var scene = document.getElementById('scene');

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- math helpers ---------- */
  function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // track(p, from, to, ease) = ease(clamp01((p - from)/(to - from)))
  function track(p, from, to, ease) {
    var t = clamp01((p - from) / (to - from));
    return ease ? ease(t) : t;
  }

  /* ---------- progress ---------- */
  function progress() {
    if (!scene) return 0;
    var denom = scene.offsetHeight - window.innerHeight;
    if (denom <= 0) return 0;
    return clamp01((window.scrollY - scene.offsetTop) / denom);
  }

  /* ---------- camera endpoints ---------- */
  var CAM = {
    fromX: -47.957, toX: -50.0,
    fromY: -80.097, toY: -36.716,
    until: 0.86,
    push: 0.11
  };

  /* ---------- hero exit windows / curves ---------- */
  var HERO_OUT_FROM = 0.297, HERO_OUT_TO = 0.508;
  var HERO_BLUR_MAX = 18; // design px (scaled by --u-hero)

  /* ---------- render one frame from a timeline value p ---------- */
  function render(p) {
    /* ---- CAMERA framing (lands at 86%, then holds) ---- */
    var f = clamp01(p / CAM.until);       // framing progress
    var camX = lerp(CAM.fromX, CAM.toX, f);
    var camY = lerp(CAM.fromY, CAM.toY, f);

    root.style.setProperty('--cam-x', camX.toFixed(4) + '%');
    root.style.setProperty('--cam-y', camY.toFixed(4) + '%');

    /* push-in peaks mid-travel, resolves to 1 */
    if (prefersReduced) {
      root.style.setProperty('--cam-z', '1');
    } else {
      var q = clamp01(p / CAM.until);
      var z = 1 + CAM.push * Math.sin(Math.PI * q);
      root.style.setProperty('--cam-z', z.toFixed(5));
    }

    /* ---- GLOW: only hero frame carries the wash ---- */
    var glowOut = track(p, 0.550, 0.950, easeInOutCubic);
    root.style.setProperty('--glow-o', (1 - glowOut).toFixed(4));

    /* ---- HERO EXIT ---- */
    var exitLinear = track(p, HERO_OUT_FROM, HERO_OUT_TO, null); // linear 0->1
    // rise: accelerating, exponent 1.75
    var heroOut = Math.pow(exitLinear, 1.75);
    // opacity: holds at 1 until exit > 0.38, then falls exponent 1.25
    var heroO = Math.pow(1 - clamp01((exitLinear - 0.38) / 0.62), 1.25);
    // blur: exponent 0.9
    var heroBlur = Math.pow(exitLinear, 0.9) * HERO_BLUR_MAX;

    root.style.setProperty('--hero-out', heroOut.toFixed(5));
    root.style.setProperty('--hero-o', heroO.toFixed(4));

    if (exitLinear > 0 && exitLinear < 1) {
      root.style.setProperty('--hero-filter',
        'blur(calc(' + heroBlur.toFixed(3) + ' * var(--u-hero)))');
      // drop badge backdrop-filter for duration of exit
      root.style.setProperty('--badge-backdrop', 'none');
    } else {
      // resolve to none at rest (pixel-exact settled hero)
      root.style.setProperty('--hero-filter', 'none');
      root.style.removeProperty('--badge-backdrop');
    }

    root.style.setProperty('--hero-vis', exitLinear >= 1 ? 'hidden' : 'visible');

    /* ---- PRODUCT arrival ---- */
    root.style.setProperty('--plat-vis', p > 0.54 ? 'visible' : 'hidden');
    var platIn = track(p, 0.557, 0.623, easeOutCubic);
    root.style.setProperty('--plat-o', platIn.toFixed(4));
    var platText = track(p, 0.563, 0.967, easeOutQuart);
    root.style.setProperty('--plat-text-p', platText.toFixed(4));
    var platShot = track(p, 0.557, 0.984, easeOutCubic);
    root.style.setProperty('--plat-shot-p', platShot.toFixed(4));

    /* ---- is-moving (scope will-change) ---- */
    if (p > 0.001 && p < 0.999) {
      root.classList.add('is-moving');
    } else {
      root.classList.remove('is-moving');
    }

    /* ---- open the intro once we're moving ---- */
    if (p > 0.05) openIntro();
  }

  /* ============================================================
     SCROLL BINDING — critically-damped approach with rate ceiling
     ============================================================ */
  var SETTLE = 9;        // exponential approach per second
  var MAX_RATE = 0.40;   // ceiling on timeline units per second
  var EPSILON = 0.0004;  // snap threshold

  var current = progress();
  var target = current;
  var rafId = null;
  var lastT = 0;

  function frame(now) {
    if (!lastT) lastT = now;
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (prefersReduced) {
      // no smoothing under reduced motion: current tracks target
      current = target;
      render(current);
      rafId = null;
      return;
    }

    var diff = target - current;
    var step = diff * (1 - Math.exp(-SETTLE * dt));
    var maxStep = MAX_RATE * dt;
    if (step > maxStep) step = maxStep;
    else if (step < -maxStep) step = -maxStep;
    current += step;

    if (Math.abs(target - current) < EPSILON) {
      current = target;
    }

    render(current);

    if (current !== target) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
      lastT = 0;
    }
  }

  function requestFrame() {
    if (rafId === null) {
      lastT = 0;
      rafId = requestAnimationFrame(frame);
    }
  }

  function onScroll() {
    target = progress();
    requestFrame();
  }

  function onResize() {
    target = progress();
    // keep current close so no jarring re-animation on resize
    requestFrame();
    closeMenuIfWide();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  /* ============================================================
     INTRO ANIMATION
     ============================================================ */
  var introOpened = false;
  var introStarted = false;

  function openIntro() {
    if (introOpened) return;
    introOpened = true;
    root.classList.add('is-open');
  }

  function startIntro() {
    if (introStarted) return;
    introStarted = true;

    // Skip conditions
    if (prefersReduced || progress() > 0.02) {
      root.classList.add('is-instant');
      openIntro();
      return;
    }

    root.classList.add('is-ready');

    var subtitle = document.querySelector('.hero__subtitle');
    var opened = false;
    function doOpen() {
      if (opened) return;
      opened = true;
      openIntro();
    }
    if (subtitle) {
      subtitle.addEventListener('animationend', doOpen, { once: true });
    }
    // backstop timer 1800ms
    setTimeout(doOpen, 1800);
  }

  // Start after fonts.ready with a 1200ms backstop
  var started = false;
  function kickIntro() {
    if (started) return;
    started = true;
    startIntro();
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(kickIntro);
  }
  setTimeout(kickIntro, 1200);

  /* ============================================================
     LEADS DOT MATRIX (generated)
     ============================================================ */
  function buildMatrix() {
    var svg = document.querySelector('.chart-matrix');
    if (!svg) return;
    var W = 238, H = 109;
    var xPitch = 21, yPitch = 17, r = 3.5;
    var startX = r + 1, startY = r + 1;
    var ns = 'http://www.w3.org/2000/svg';
    for (var y = startY; y <= H - r; y += yPitch) {
      for (var x = startX; x <= W - r; x += xPitch) {
        var c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', x);
        c.setAttribute('cy', y);
        c.setAttribute('r', r);
        c.setAttribute('fill', '#fff');
        // vary opacity to suggest density: denser toward top-left
        var densX = 1 - (x / W);
        var densY = 1 - (y / H);
        var base = 0.12 + 0.55 * (0.5 * densX + 0.5 * densY);
        var jitter = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        jitter = jitter - Math.floor(jitter);
        var op = clamp01(base + (jitter - 0.5) * 0.25);
        c.setAttribute('fill-opacity', op.toFixed(3));
        svg.appendChild(c);
      }
    }
  }
  buildMatrix();

  /* ============================================================
     MOBILE MENU
     ============================================================ */
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');

  function menuIsOpen() {
    return menu && !menu.hasAttribute('hidden');
  }

  function openMenu() {
    if (!menu) return;
    menu.removeAttribute('hidden');
    root.classList.add('is-menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    var first = menu.querySelector('a, button');
    if (first) first.focus();
  }

  function closeMenu(returnFocus) {
    if (!menu) return;
    menu.setAttribute('hidden', '');
    root.classList.remove('is-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menu');
    if (returnFocus && toggle) toggle.focus();
  }

  function closeMenuIfWide() {
    if (window.innerWidth > 900 && menuIsOpen()) {
      closeMenu(false);
    }
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menuIsOpen()) closeMenu(true);
      else openMenu();
    });

    // Escape returns focus to toggle
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuIsOpen()) {
        closeMenu(true);
      }
    });

    // Close on link click
    menu.addEventListener('click', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'A' || t.closest('a'))) {
        closeMenu(false);
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!menuIsOpen()) return;
      if (menu.contains(e.target) || toggle.contains(e.target)) return;
      closeMenu(false);
    });
  }

  /* ============================================================
     COPY-TO-CLIPBOARD BUTTONS
     ============================================================ */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-copy]') : null;
    if (!btn) return;
    var sel = btn.getAttribute('data-copy');
    var src = sel && document.querySelector(sel);
    if (!src) return;
    var text = src.textContent.trim();
    var done = function () {
      var prev = btn.textContent;
      btn.textContent = 'copied';
      setTimeout(function () { btn.textContent = prev; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  });

  function fallbackCopy(text, cb) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (cb) cb();
    } catch (err) { /* no-op */ }
  }

  /* ============================================================
     FAQ ACCORDION
     ============================================================ */
  var faqButtons = document.querySelectorAll('.faq__q');
  Array.prototype.forEach.call(faqButtons, function (q) {
    var panel = q.nextElementSibling;
    q.addEventListener('click', function () {
      var open = q.getAttribute('aria-expanded') === 'true';
      if (open) {
        q.setAttribute('aria-expanded', 'false');
        panel.style.maxHeight = '0px';
      } else {
        q.setAttribute('aria-expanded', 'true');
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });

  /* ============================================================
     SECTION SCROLL-SPY (side rail active state)
     ============================================================ */
  var railLinks = document.querySelectorAll('.rail__list a');
  if ('IntersectionObserver' in window && railLinks.length) {
    var linkFor = {};
    Array.prototype.forEach.call(railLinks, function (a) {
      var id = a.getAttribute('href').slice(1);
      linkFor[id] = a;
    });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = linkFor[en.target.id];
        if (!a) return;
        if (en.isIntersecting) {
          Array.prototype.forEach.call(railLinks, function (l) { l.classList.remove('is-active'); });
          a.classList.add('is-active');
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    Object.keys(linkFor).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }

  /* ============================================================
     REVEAL-ON-SCROLL for sections
     ============================================================ */
  if ('IntersectionObserver' in window && !prefersReduced) {
    var reveal = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          obs.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    document.querySelectorAll('.sec, .brief').forEach(function (el) { reveal.observe(el); });
  } else {
    document.querySelectorAll('.sec, .brief').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ============================================================
     MINT rUSDC — swap UI (1:1 mirror + mint/redeem toggle)
     ============================================================ */
  (function mintUI() {
    var panel = document.querySelector('.mint');
    if (!panel) return;

    var cfg = window.RETICENCE_CONFIG || {};
    var net = (cfg.networks && cfg.networks[cfg.network]) || null;
    // Display symbols: ASSET is deposited (native USDC on Arc), SHARE is the vault token.
    var ASSET = cfg.ASSET_SYMBOL || 'USDC';
    var SHARE = cfg.SHARE_SYMBOL || 'rUSDC';

    var tabs = panel.querySelectorAll('.mint__tab');
    var amountInput = document.getElementById('mint-amount');
    var outputInput = document.getElementById('mint-output');
    var submit = document.getElementById('mint-submit');
    var disconnectBtn = document.getElementById('mint-disconnect');
    var hint = document.getElementById('mint-hint');
    var balEl = document.getElementById('mint-balance');
    var maxBtn = document.getElementById('mint-max');
    // Leave a little USDC for gas when using MAX (Arc fees are a fraction of a cent).
    var GAS_RESERVE = '0.05';
    var payLabel = panel.querySelector('[data-role="pay-label"]');
    var getLabel = panel.querySelector('[data-role="get-label"]');
    var payAsset = panel.querySelector('[data-role="pay-asset"]');
    var getAsset = panel.querySelector('[data-role="get-asset"]');

    var mode = 'mint';          // 'mint' | 'redeem'
    var account = null;         // connected address
    var provider = null;        // ethers BrowserProvider
    var signer = null;
    var reth = null;            // contract instance (write)
    var busy = false;
    var ethBal = null;          // bigint — user's native USDC balance (18-dec on Arc)
    var rethBal = null;         // bigint — user's rUSDC balance
    var rateWei = null;         // bigint — USDC value of 1e18 rUSDC (1e18 == 1:1)

    var hasEthers = typeof window.ethers !== 'undefined';
    var WAD = hasEthers ? 10n ** 18n : null;

    // Active injected provider chosen by the user (EIP-1193 object).
    var eip1193 = null;

    /* ---------- multi-wallet discovery (EIP-6963) ---------- */
    // Wallets announce themselves via 'eip6963:announceProvider'. This lets us
    // list MetaMask, Phantom, Coinbase, Rabby, etc. separately instead of only
    // whatever hijacked window.ethereum.
    var discovered = [];       // [{ info:{uuid,name,icon,rdns}, provider }]
    var seenUuids = {};

    function addProvider(detail) {
      if (!detail || !detail.info || !detail.provider) return;
      if (seenUuids[detail.info.uuid]) return;
      seenUuids[detail.info.uuid] = true;
      discovered.push(detail);
    }

    window.addEventListener('eip6963:announceProvider', function (e) {
      addProvider(e.detail);
    });
    // Ask any already-loaded wallets to announce.
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    function walletList() {
      // Start from EIP-6963 discoveries.
      var list = discovered.slice();
      // Fallback: legacy window.ethereum (may itself expose .providers array).
      if (window.ethereum) {
        var legacy = window.ethereum.providers && window.ethereum.providers.length
          ? window.ethereum.providers
          : [window.ethereum];
        legacy.forEach(function (p) {
          var name = p.isMetaMask ? 'MetaMask'
            : p.isPhantom ? 'Phantom'
            : p.isCoinbaseWallet ? 'Coinbase Wallet'
            : p.isRabby ? 'Rabby'
            : 'Injected wallet';
          // Avoid duplicating a wallet already found via 6963 (best-effort by name).
          var dup = list.some(function (d) { return d.info.name === name; });
          if (!dup) list.push({ info: { uuid: 'legacy-' + name, name: name, icon: '' }, provider: p });
        });
      }
      return list;
    }

    function hasAnyWallet() { return walletList().length > 0; }

    function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

    // USDC: a plain coin. rUSDC: the same coin in the site's sky gradient.
    var DOLLAR_PATH = '<path d="M12 6.4v11.2M14.4 9.1c-.3-1-1.2-1.6-2.4-1.6-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.2-1.1 2-2.5 2-1.3 0-2.3-.6-2.6-1.7" fill="none" stroke-width="1.5" stroke-linecap="round"/>';
    var ASSET_SVG = '<svg class="mint__asset-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9.5" fill="#fff" fill-opacity="0.92"/>' +
      DOLLAR_PATH.replace('fill="none"', 'fill="none" stroke="#1c3a6b"') + '</svg>';
    var SHARE_SVG = '<svg class="mint__asset-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><linearGradient id="rusdcg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#3f66aa"/><stop offset="1" stop-color="#7fa9d8"/></linearGradient></defs>' +
      '<circle cx="12" cy="12" r="9.5" fill="url(#rusdcg)"/>' +
      '<circle cx="12" cy="12" r="9.5" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1"/>' +
      DOLLAR_PATH.replace('fill="none"', 'fill="none" stroke="#fff"') + '</svg>';

    function assetMarkup(sym) {
      var icon = sym === SHARE ? SHARE_SVG : ASSET_SVG;
      return icon + '<span>' + sym + '</span>';
    }

    function sanitize(v) {
      v = (v || '').replace(/[^0-9.]/g, '');
      var parts = v.split('.');
      if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
      return v;
    }

    function mirror() {
      var val = sanitize(amountInput.value);
      if (val === '' || !hasEthers) { outputInput.value = val; return; }
      var rate = rateWei != null ? rateWei : WAD; // USDC per 1 rUSDC, 1e18-scaled
      var out;
      try {
        var inWei = window.ethers.parseEther(val);
        if (mode === 'mint') {
          // rUSDC received = USDC_in / rate
          out = (inWei * WAD) / rate;
        } else {
          // USDC received = rUSDC_in * rate
          out = (inWei * rate) / WAD;
        }
        var s = parseFloat(window.ethers.formatEther(out));
        outputInput.value = isFinite(s) ? String(Math.round(s * 1e6) / 1e6) : val;
      } catch (e) {
        outputInput.value = val;
      }
    }

    function refreshRateUI() {
      // USDC value of 1 rUSDC, e.g. "1.0000"
      var rate = rateWei != null ? rateWei : WAD;
      var rStr = hasEthers ? parseFloat(window.ethers.formatEther(rate)).toFixed(4) : '1.0000';
      setText('rate-value', '1 ' + SHARE + ' = ' + rStr + ' ' + ASSET);
      // Value of the user's rUSDC position in USDC
      if (account && rethBal != null && hasEthers) {
        var val = (rethBal * rate) / WAD;
        setText('rate-position', fmt(val) + ' ' + ASSET);
      } else {
        setText('rate-position', '—');
      }
    }

    function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

    function fmt(bn) {
      if (bn == null || !hasEthers) return '0.000';
      try {
        var s = window.ethers.formatEther(bn);
        var n = parseFloat(s);
        return (isFinite(n) ? n : 0).toFixed(3);
      } catch (e) { return '0.000'; }
    }

    function refreshBalanceLabel() {
      if (!balEl) return;
      if (!account) { balEl.textContent = '0.000'; if (maxBtn) maxBtn.disabled = true; return; }
      if (mode === 'mint') {
        balEl.textContent = fmt(ethBal) + ' ' + ASSET;
        if (maxBtn) maxBtn.disabled = (ethBal == null || ethBal <= 0n);
      } else {
        balEl.textContent = fmt(rethBal) + ' ' + SHARE;
        if (maxBtn) maxBtn.disabled = (rethBal == null || rethBal <= 0n);
      }
    }

    // Max amount available for the current mode.
    function maxAmount() {
      if (!hasEthers) return null;
      if (mode === 'mint') {
        // USDC balance minus a small gas reserve (gas is paid in USDC on Arc).
        if (ethBal == null) return null;
        try {
          var reserve = window.ethers.parseEther(GAS_RESERVE);
          return ethBal > reserve ? ethBal - reserve : 0n;
        } catch (e) { return null; }
      } else {
        // Withdraw: full rUSDC balance (gas comes from the native USDC balance).
        return rethBal;
      }
    }

    function setBusy(state, label) {
      busy = state;
      submit.disabled = state;
      submit.style.opacity = state ? '0.6' : '';
      submit.style.cursor = state ? 'wait' : '';
      if (label) submit.textContent = label;
    }

    function setSubmitLabel() {
      if (busy) return;
      if (!account) { submit.textContent = hasAnyWallet() ? 'Connect wallet' : 'Install a wallet'; return; }
      submit.textContent = mode === 'mint' ? 'Mint ' + SHARE : 'Withdraw ' + ASSET;
    }

    function applyMode() {
      var isMint = mode === 'mint';
      var paySym = isMint ? ASSET : SHARE;
      var getSym = isMint ? SHARE : ASSET;

      if (payLabel) payLabel.textContent = 'You pay';
      if (getLabel) getLabel.textContent = 'You receive';
      if (payAsset) { payAsset.innerHTML = assetMarkup(paySym); payAsset.classList.toggle('mint__asset--r', paySym === SHARE); }
      if (getAsset) { getAsset.innerHTML = assetMarkup(getSym); getAsset.classList.toggle('mint__asset--r', getSym === SHARE); }

      setSubmitLabel();
      refreshBalanceLabel();
      mirror();

      if (!account) {
        hint.textContent = isMint ? 'Connect a wallet to mint ' + SHARE + '.' : 'Connect a wallet to withdraw ' + ASSET + '.';
        if (disconnectBtn) disconnectBtn.hidden = true;
      } else {
        var mx = maxAmount();
        var mxStr = mx != null ? fmt(mx) : '0.000';
        hint.textContent = isMint
          ? 'Connected ' + short(account) + ' · up to ' + mxStr + ' ' + SHARE + ' mintable'
          : 'Connected ' + short(account) + ' · up to ' + mxStr + ' ' + ASSET + ' withdrawable';
        if (disconnectBtn) disconnectBtn.hidden = false;
      }
    }

    /* ---------- wallet + chain ---------- */
    function ensureChain() {
      if (!net || !eip1193) return Promise.resolve();
      return eip1193.request({ method: 'eth_chainId' }).then(function (current) {
        if (current === net.chainId) return;
        return eip1193.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: net.chainId }]
        }).catch(function (err) {
          // 4902 = chain not added yet
          if (err && err.code === 4902) {
            return eip1193.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: net.chainId,
                chainName: net.chainName,
                nativeCurrency: net.nativeCurrency,
                rpcUrls: net.rpcUrls,
                blockExplorerUrls: net.blockExplorerUrls
              }]
            });
          }
          throw err;
        });
      });
    }

    function buildContract() {
      if (!cfg.VAULT_ADDRESS) { reth = null; return; }
      reth = new window.ethers.Contract(cfg.VAULT_ADDRESS, cfg.VAULT_ABI, signer);
    }

    function loadBalances() {
      if (!account || !provider) return Promise.resolve();
      var jobs = [provider.getBalance(account)];
      if (reth) {
        jobs.push(reth.balanceOf(account));
        jobs.push(reth.exchangeRate());
      } else {
        jobs.push(Promise.resolve(null));
        jobs.push(Promise.resolve(null));
      }
      return Promise.all(jobs).then(function (res) {
        ethBal = res[0];
        rethBal = res[1];
        if (res[2] != null) rateWei = res[2];
        refreshBalanceLabel();
        refreshRateUI();
        mirror();
      }).catch(function () {});
    }

    // Connect using a specific chosen EIP-1193 provider.
    function connectWith(chosen) {
      if (!hasEthers) { hint.textContent = 'Could not load ethers.js. Check your network and reload.'; return; }
      if (!chosen) { hint.textContent = 'No wallet selected.'; return; }
      eip1193 = chosen;
      bindProviderEvents(eip1193);
      setBusy(true, 'Connecting…');
      // Request accounts FIRST (unlocks the wallet), THEN switch chains.
      eip1193.request({ method: 'eth_requestAccounts' })
        .then(function (accts) {
          account = accts && accts[0];
          if (!account) throw { code: 4001 };
          return ensureChain();
        })
        .then(function () {
          provider = new window.ethers.BrowserProvider(eip1193);
          return provider.getSigner();
        })
        .then(function (s) {
          signer = s;
          buildContract();
          setBusy(false);
          applyMode();
          return loadBalances();
        })
        .catch(function (err) {
          setBusy(false);
          setSubmitLabel();
          hint.textContent = readableError(err);
        });
    }

    // Clear the local connection so the user can connect a different account.
    // (A dApp cannot force the wallet extension to log out; this resets our
    // state and re-prompts on the next connect so another account can be picked.)
    function disconnect() {
      account = null;
      signer = null;
      reth = null;
      ethBal = null;
      rethBal = null;
      rateWei = null;
      // Best-effort: ask the wallet to forget this site's permission so the
      // account chooser shows again next time (supported by MetaMask/Rabby).
      if (eip1193 && eip1193.request) {
        eip1193.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }]
        }).catch(function () { /* not all wallets support it; ignore */ });
      }
      eip1193 = null;
      applyMode();
      refreshRateUI();
    }

    // Entry point: decide whether to show a picker or connect directly.
    function connect() {
      var list = walletList();
      if (list.length === 0) {
        hint.textContent = 'No EVM wallet found. Install MetaMask, Phantom, or another EVM wallet and reload.';
        return;
      }
      if (list.length === 1) { connectWith(list[0].provider); return; }
      openWalletPicker(list);
    }

    /* ---------- wallet picker modal ---------- */
    function openWalletPicker(list) {
      var overlay = document.createElement('div');
      overlay.className = 'wallet-modal';
      var box = document.createElement('div');
      box.className = 'wallet-modal__box';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Choose a wallet');

      var title = document.createElement('div');
      title.className = 'wallet-modal__title';
      title.textContent = 'Choose a wallet';
      box.appendChild(title);

      list.forEach(function (w) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wallet-modal__item';
        // Build with DOM calls: wallet-supplied icon URLs / names are not trusted markup.
        var icon;
        if (w.info.icon) {
          icon = document.createElement('img');
          icon.src = w.info.icon;
          icon.alt = '';
          icon.className = 'wallet-modal__icon';
        } else {
          icon = document.createElement('span');
          icon.className = 'wallet-modal__icon wallet-modal__icon--dot';
        }
        var label = document.createElement('span');
        label.textContent = w.info.name;
        btn.appendChild(icon);
        btn.appendChild(label);
        btn.addEventListener('click', function () {
          close();
          connectWith(w.provider);
        });
        box.appendChild(btn);
      });

      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'wallet-modal__cancel';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);
      box.appendChild(cancel);

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      var closing = false;
      function close() {
        if (closing) return;
        closing = true;
        document.removeEventListener('keydown', onKey);
        var remove = function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) { remove(); return; }
        // Play the exit animation (see .wallet-modal.is-closing), then remove.
        var timer = setTimeout(remove, 480);
        overlay.addEventListener('animationend', function (e) {
          if (e.target !== overlay) return;
          clearTimeout(timer);
          remove();
        });
        overlay.classList.add('is-closing');
      }
      function onKey(e) { if (e.key === 'Escape') close(); }
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      document.addEventListener('keydown', onKey);
      var first = box.querySelector('.wallet-modal__item');
      if (first) first.focus();
    }

    /* ---------- provider events, scoped to the chosen wallet ---------- */
    var boundProvider = null;
    function bindProviderEvents(p) {
      if (!p || !p.on || boundProvider === p) return;
      boundProvider = p;
      p.on('accountsChanged', function (accts) {
        account = accts && accts[0] ? accts[0] : null;
        if (account && provider) {
          provider.getSigner().then(function (s) { signer = s; buildContract(); applyMode(); loadBalances(); });
        } else {
          signer = null; reth = null; ethBal = null; rethBal = null; applyMode();
        }
      });
      p.on('chainChanged', function () { window.location.reload(); });
    }

    function readableError(err) {
      if (!err) return 'Something went wrong.';
      if (err.code === 4001 || (err.info && err.info.error && err.info.error.code === 4001)) return 'Request rejected in wallet.';
      if (err.shortMessage) return err.shortMessage;
      if (err.reason) return err.reason;
      if (err.message) return err.message.length > 120 ? err.message.slice(0, 117) + '…' : err.message;
      return 'Transaction failed.';
    }

    function explorerTx(hash) {
      if (net && net.blockExplorerUrls && net.blockExplorerUrls[0]) {
        return net.blockExplorerUrls[0].replace(/\/$/, '') + '/tx/' + hash;
      }
      return null;
    }

    /* ---------- mint / withdraw ---------- */
    function submitTx() {
      if (busy) return;
      if (!account) { connect(); return; }
      if (!cfg.VAULT_ADDRESS || !reth) {
        hint.textContent = 'Not live yet — the contract address will be announced soon.';
        return;
      }
      var val = sanitize(amountInput.value);
      if (!val || parseFloat(val) <= 0) { hint.textContent = 'Enter an amount greater than zero.'; return; }

      var wei;
      try { wei = window.ethers.parseEther(val); }
      catch (e) { hint.textContent = 'Invalid amount.'; return; }

      var isMint = mode === 'mint';

      if (isMint) {
        if (ethBal != null && wei > ethBal) { hint.textContent = 'Amount exceeds your ' + ASSET + ' balance.'; return; }
      } else {
        if (rethBal != null && wei > rethBal) { hint.textContent = 'Amount exceeds your ' + SHARE + ' balance.'; return; }
      }

      setBusy(true, isMint ? 'Minting…' : 'Withdrawing…');
      hint.textContent = 'Confirm the transaction in your wallet…';

      // Mint: deposit native USDC as value. Withdraw: redeem vault shares.
      var call = isMint ? reth.deposit({ value: wei }) : reth.redeem(wei);

      call.then(function (tx) {
        hint.textContent = 'Submitted. Waiting for confirmation…';
        return tx.wait();
      }).then(function (receipt) {
        var link = receipt && receipt.hash ? explorerTx(receipt.hash) : null;
        hint.innerHTML = (isMint ? 'Minted ' + SHARE + '.' : 'Withdrew ' + ASSET + '.') +
          (link ? ' <a href="' + link + '" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;">view tx</a>' : '');
        setBusy(false);
        setSubmitLabel();
        return loadBalances();
      }).catch(function (err) {
        setBusy(false);
        setSubmitLabel();
        hint.textContent = readableError(err);
      });
    }

    /* ---------- events ---------- */
    // Mint / Withdraw toggle
    var toggleBtns = panel.querySelectorAll('.mint__toggle-btn');
    Array.prototype.forEach.call(toggleBtns, function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-mode');
        if (next === mode) return;
        mode = next;
        Array.prototype.forEach.call(toggleBtns, function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        applyMode();
      });
    });

    if (maxBtn) {
      maxBtn.disabled = true;
      maxBtn.addEventListener('click', function () {
        var mx = maxAmount();
        if (mx == null || mx <= 0n) return;
        amountInput.value = window.ethers.formatEther(mx);
        mirror();
      });
    }

    amountInput.addEventListener('input', function () {
      var s = sanitize(amountInput.value);
      if (s !== amountInput.value) amountInput.value = s;
      mirror();
    });

    submit.addEventListener('click', submitTx);
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);

    /* ---------- operator: add yield ---------- */
    (function yieldPanel() {
      var yAmount = document.getElementById('yield-amount');
      var ySubmit = document.getElementById('yield-submit');
      var yHint = document.getElementById('yield-hint');
      if (!yAmount || !ySubmit || !yHint) return;

      function refreshYieldLabel() {
        if (busy) return;
        ySubmit.textContent = account ? 'Add yield' : (hasAnyWallet() ? 'Connect wallet' : 'Install a wallet');
      }

      yAmount.addEventListener('input', function () {
        var s = sanitize(yAmount.value);
        if (s !== yAmount.value) yAmount.value = s;
      });

      ySubmit.addEventListener('click', function () {
        if (busy) return;
        if (!account) { connect(); return; }
        if (!cfg.VAULT_ADDRESS || !reth) {
          yHint.textContent = 'Not live yet — deploy the vault and set its address first.';
          return;
        }
        var val = sanitize(yAmount.value);
        if (!val || parseFloat(val) <= 0) { yHint.textContent = 'Enter an amount greater than zero.'; return; }
        var wei;
        try { wei = window.ethers.parseEther(val); }
        catch (e) { yHint.textContent = 'Invalid amount.'; return; }
        if (ethBal != null && wei > ethBal) { yHint.textContent = 'Amount exceeds your ' + ASSET + ' balance.'; return; }

        setBusy(true, 'Adding…');
        ySubmit.disabled = true;
        yHint.textContent = 'Confirm the transaction in your wallet…';

        reth.addYield({ value: wei }).then(function (tx) {
          yHint.textContent = 'Submitted. Waiting for confirmation…';
          return tx.wait();
        }).then(function (receipt) {
          var link = receipt && receipt.hash ? explorerTx(receipt.hash) : null;
          yHint.innerHTML = 'Yield added — every ' + SHARE + ' is now worth more.' +
            (link ? ' <a href="' + link + '" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;">view tx</a>' : '');
          setBusy(false);
          ySubmit.disabled = false;
          refreshYieldLabel();
          return loadBalances();
        }).catch(function (err) {
          setBusy(false);
          ySubmit.disabled = false;
          refreshYieldLabel();
          yHint.textContent = readableError(err);
        });
      });

      // Keep the yield button label in sync when the wallet connects.
      var _origApplyMode = applyMode;
      applyMode = function () {
        _origApplyMode();
        refreshYieldLabel();
        if (account) yHint.textContent = 'Pay rent and property gains into the vault as ' + ASSET + ' to raise the rate.';
      };
      refreshYieldLabel();
    })();

    /* ---------- live dashboard stats (read-only, no wallet needed) ---------- */
    function fmtNum(bn) {
      try {
        var n = parseFloat(window.ethers.formatEther(bn));
        return (isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
      } catch (e) { return '—'; }
    }

    function loadDashStats() {
      if (!hasEthers || !cfg.VAULT_ADDRESS || !net || !net.rpcUrls || !net.rpcUrls[0]) return;
      var rpc = net.rpcUrls[0];
      if (rpc.indexOf('{API_KEY}') !== -1) return; // unconfigured key
      try {
        var ro = new window.ethers.JsonRpcProvider(rpc);
        var c = new window.ethers.Contract(cfg.VAULT_ADDRESS, cfg.VAULT_ABI, ro);
        Promise.all([ro.getBalance(cfg.VAULT_ADDRESS), c.totalSupply()]).then(function (r) {
          var eth = fmtNum(r[0]);
          var sup = fmtNum(r[1]);
          setText('dash-eth-locked', eth);
          setText('dash-eth-2', eth);
          setText('dash-supply', sup);
          setText('dash-supply-2', sup);
        }).catch(function () {});
      } catch (e) {}
    }
    loadDashStats();

    // reflect the connected user's rUSDC into the dashboard "Your rUSDC" card
    var _origLoadBalances = loadBalances;
    loadBalances = function () {
      return _origLoadBalances().then(function () {
        if (rethBal != null) setText('dash-your-reth', fmt(rethBal));
      });
    };

    // Provider events are bound in bindProviderEvents() once a wallet is chosen.

    applyMode();
  })();

  /* ============================================================
     SMOOTH IN-PAGE SCROLLING (eased, header-aware)
     ============================================================ */
  (function smoothLinks() {
    var HEADER_OFFSET = 88;
    var DURATION = 720; // ms

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function targetTop(el) {
      var rect = el.getBoundingClientRect();
      var abs = rect.top + window.scrollY - HEADER_OFFSET;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(abs, max));
    }

    function scrollToEl(el, done) {
      // Respect reduced motion: jump instantly.
      if (prefersReduced) {
        window.scrollTo(0, targetTop(el));
        if (done) done();
        return;
      }
      var start = window.scrollY;
      var end = targetTop(el);
      var dist = end - start;
      if (Math.abs(dist) < 2) { if (done) done(); return; }
      var t0 = null;
      function step(now) {
        if (t0 === null) t0 = now;
        var p = Math.min(1, (now - t0) / DURATION);
        window.scrollTo(0, start + dist * easeInOutCubic(p));
        if (p < 1) requestAnimationFrame(step);
        else if (done) done();
      }
      requestAnimationFrame(step);
    }

    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#' || href === '#') {
        // "#top" handled below; other links (app.html, external) fall through.
        if (href !== '#top') return;
      }
      var id = href.slice(1);
      var el = id === 'top' ? document.body : document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      scrollToEl(el, function () {
        // Update the hash without a second jump.
        if (history.replaceState) history.replaceState(null, '', href);
        // Move focus for accessibility AFTER the scroll, so it can't
        // trigger an instant jump that fights the animation.
        if (el.setAttribute && id !== 'top') {
          el.setAttribute('tabindex', '-1');
          try { el.focus({ preventScroll: true }); } catch (err) { /* no-op */ }
        }
      });
    });
  })();

  /* ============================================================
     FOOTER YEAR
     ============================================================ */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ============================================================
     INITIAL PAINT
     ============================================================ */
  render(current);
  requestFrame();
})();
