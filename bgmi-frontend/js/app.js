/* ============================================================
   BGMITopUp — Front-end logic for Battlegrounds Mobile India
   ------------------------------------------------------------
   Pages:
     index.html  → landing + Character ID (UID) verification
     store.html  → UC store (guarded by Character ID verification)
   ============================================================ */

// ============================================================
// 🔥 BACKEND API CONFIGURATION (Same backend URL)
// ============================================================
const BACKEND_URL = 'https://api.ff-topupp.shop';

function getApiUrl(path) {
    if (!path.startsWith('/')) path = '/' + path;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal && BACKEND_URL) {
        return BACKEND_URL.replace(/\/+$/, '') + path;
    }
    return path;
}

function getMediaUrl(path) {
    if (!path) return '';
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) {
        return path;
    }
    if (!path.startsWith('/')) path = '/' + path;
    if (BACKEND_URL) {
        return BACKEND_URL.replace(/\/+$/, '') + path;
    }
    return path;
}

const CONFIG = {
    USE_MOCK: false,
    API_URL: '/api/bgmi-verify?uid={UID}',
    ALT_API_URL: '/api/verify?uid={UID}&game=bgmi',
    API_HEADERS: {},
    CURRENCY: '₹',
};

/* ------------------------------------------------------------
   BGMI Player Verification (Rooter / UniPin live integration)
   ------------------------------------------------------------ */
async function fetchPlayerInfo(uid) {
    if (CONFIG.USE_MOCK) return mockPlayerInfo(uid);
    try {
        const player = await fetchPlayerFrom(CONFIG.API_URL, uid);
        if (player) return player;
    } catch (e1) {
        try {
            const player2 = await fetchPlayerFrom(CONFIG.ALT_API_URL, uid);
            if (player2) return player2;
        } catch (e2) {
            const msg = e2.message || e1.message || 'Character ID not found. Please check your ID and try again.';
            throw new Error(msg);
        }
    }
    return mockPlayerInfo(uid);
}

async function fetchPlayerFrom(urlTemplate, uid) {
    let url = urlTemplate.replace('{UID}', encodeURIComponent(uid));
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = getApiUrl(url);
    }
    let res;
    try {
        res = await fetch(url, { headers: CONFIG.API_HEADERS });
    } catch (_) {
        throw new Error('Network error — please check your connection and try again.');
    }

    let data;
    try {
        data = await res.json();
    } catch (_) {
        throw new Error('Character ID not found. Please check your ID and try again.');
    }

    if (!res.ok || (data && data.status === 'error')) {
        throw new Error(data?.message || 'Character ID not found. Please check your ID and try again.');
    }

    if (data && data.status === 'proxy_error') {
        throw new Error(data.message || 'Verification service is temporarily unavailable. Please try again.');
    }

    const player = normalizePlayer(data, uid);
    if (!player) throw new Error('Character ID not found. Please check your ID and try again.');
    return player;
}

function pickField(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
}

function normalizePlayer(data, uid) {
    if (!data || typeof data !== 'object') return null;

    const d = data.data && typeof data.data === 'object' ? data.data : data;
    const unipin = data.unipinRes || (d && d.unipinRes) || {};
    const info = data.basicinfo || data.basicInfo || d.basicInfo || d.basicinfo ||
        d.AccountInfo || d.account || d.profile || d.player || d;
    const clan = data.clanbasicinfo || data.clanBasicInfo || d.clanBasicInfo ||
        d.ClanInfo || d.clan || {};

    const nickname = pickField(unipin, ['username', 'nickname', 'name']) ||
        pickField(data, ['username', 'nickname', 'name', 'AccountName']) ||
        pickField(info, ['nickname', 'name', 'AccountName', 'username', 'nick']);
    if (!nickname) return null;

    const accountId = pickField(info, ['accountid', 'accountId', 'AccountId', 'uid', 'id', 'AccountUID']) ||
        pickField(data, ['accountid', 'accountId', 'uid', 'id']);
    const level = pickField(info, ['level', 'AccountLevel', 'lvl']);
    const region = pickField(info, ['region', 'AccountRegion', 'Region']);
    const liked = pickField(info, ['liked', 'likes', 'AccountLikes', 'like', 'popularity']);
    const elite = pickField(info, ['haselitepass', 'hasElitePass', 'elitePass', 'ElitePass', 'royalePass', 'hasRoyalePass']);
    const clanName = pickField(clan, ['clanname', 'clanName', 'ClanName', 'name']);

    return {
        nickname: String(nickname),
        uid: accountId != null ? String(accountId) : String(uid),
        level: level != null ? level : (45 + (parseInt(uid.slice(-2)) || 10) % 40),
        region: region || 'India / Asia',
        likes: typeof liked === 'number' ? liked : (liked != null && !isNaN(+liked) ? +liked : 12450),
        clan: clanName ? String(clanName).trim() : 'GodLike Esports',
        elitePass: elite != null ? !!elite : true,
    };
}

function mockPlayerInfo(uid) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (!/^\d{5,12}$/.test(uid)) {
                reject(new Error('Character ID not found. Make sure it is 5–12 digits.'));
                return;
            }
            const names = ['Mortal_Soul', 'Jonathan_007', 'Dynamo_Hydra', 'Scout_OP', 'Snax_Gamer', 'GodL_Shadow', 'Ninja_Sniper', 'Mavi_X', 'Goblin_YT', 'Viper_IND', 'ProHunter_BGMI'];
            const clans = ['TeamSoul', 'GodLike', 'Hydra Esports', 'Revenant', 'Entity Gaming', 'Blind Esports'];
            const seed = [...uid].reduce((a, c) => a + (+c), 0);
            resolve({
                nickname: names[seed % names.length] + (seed % 89),
                uid,
                level: 52 + (seed % 38),
                region: 'India / Asia',
                likes: 18500 + (seed * 230),
                clan: clans[seed % clans.length],
                elitePass: (seed % 2 === 0),
            });
        }, 900);
    });
}

/* ============================================================
   Helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => `${CONFIG.CURRENCY}${n.toLocaleString('en-IN')}`;

const PLAYER_KEY = 'bgmi_player';
const savePlayer = (p) => {
    const value = JSON.stringify(p);
    try { sessionStorage.setItem(PLAYER_KEY, value); } catch (_) {}
    try { localStorage.setItem(PLAYER_KEY, value); } catch (_) {}
};
const loadPlayer = () => {
    try {
        const sessionValue = sessionStorage.getItem(PLAYER_KEY);
        if (sessionValue) return JSON.parse(sessionValue);
    } catch (_) {}
    try {
        const localValue = localStorage.getItem(PLAYER_KEY);
        return localValue ? JSON.parse(localValue) : null;
    } catch (_) {
        return null;
    }
};
const clearPlayer = () => {
    try { sessionStorage.removeItem(PLAYER_KEY); } catch (_) {}
    try { localStorage.removeItem(PLAYER_KEY); } catch (_) {}
};

const state = {
    player: loadPlayer(),
    currentCat: 'uc',
    selected: null
};

function premiumEmoji(el = document.body) {
    if (window.twemoji) {
        twemoji.parse(el, {
            folder: 'svg',
            ext: '.svg',
            base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/',
        });
    }
}

function toast(msg, type = '') {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => (t.hidden = true), 300);
    }, 3200);
}

function openModal(el) {
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeModal(el) {
    if (!el) return;
    el.hidden = true;
    document.body.style.overflow = '';
}

function initModals() {
    $$('.modal-overlay').forEach(ov =>
        ov.addEventListener('click', (e) => {
            if (e.target === ov) closeModal(ov);
        })
    );
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') $$('.modal-overlay').forEach(closeModal);
    });
}

/* ============================================================
   Theme toggle
   ============================================================ */
function initTheme() {
    const btn = $('#themeToggle');
    if (!btn) return;
    const root = document.documentElement;
    const setIcon = () => {
        btn.textContent = root.classList.contains('dark') ? '☀️' : '🌙';
    };
    setIcon();
    btn.addEventListener('click', () => {
        root.classList.toggle('dark');
        try {
            localStorage.setItem('bgmi_theme', root.classList.contains('dark') ? 'dark' : 'light');
        } catch (_) {}
        setIcon();
    });
}

/* ============================================================
   Header nav
   ============================================================ */
function initNav() {
    const navToggle = $('#navToggle');
    const mainNav = $('#mainNav');
    if (!navToggle || !mainNav) return;

    navToggle.addEventListener('click', () => {
        mainNav.classList.toggle('open');
        navToggle.classList.toggle('open');
    });
    $$('.main-nav a').forEach(a => a.addEventListener('click', () => {
        mainNav.classList.remove('open');
        navToggle.classList.remove('open');
    }));
}

/* ============================================================
   Reveal animations
   ============================================================ */
const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
        }
    });
}, { threshold: 0.15 });

function initReveal() {
    $$('.section-head, .step, .uid-card, .acc-item').forEach(el => {
        el.classList.add('reveal');
        io.observe(el);
    });
}

/* ============================================================
   Purchase Activity Popup (BGMI UC Purchases)
   ============================================================ */
function initSalePops() {
    const names = ['Aman', 'Rohit', 'Arjun', 'Aryan', 'Sahil', 'Vikram', 'Aditya', 'Karan', 'Dev', 'Siddharth', 'Harsh', 'Varun', 'Nikhil', 'Gaurav', 'Manish', 'Kabir', 'Rohan', 'Sneha', 'Priya', 'Ananya'];
    const states = ['Delhi', 'Mumbai', 'Bangalore', 'Punjab', 'Uttar Pradesh', 'Hyderabad', 'Kolkata', 'Pune', 'Jaipur', 'Gujarat', 'Haryana', 'Kerala', 'Chandigarh'];
    const rand = (a) => a[Math.floor(Math.random() * a.length)];

    let products = Object.values(window.PRODUCTS || {}).flat();

    const pop = document.createElement('div');
    pop.className = 'sale-pop';
    pop.hidden = true;
    document.body.appendChild(pop);

    const scheduleNext = () => setTimeout(show, 6500);

    function show() {
        const pay = document.getElementById('payOverlay');
        if (pay && !pay.hidden) { scheduleNext(); return; }
        if (!products.length) { scheduleNext(); return; }

        const p = rand(products);
        const mins = 1 + Math.floor(Math.random() * 9);
        const icon = p.image ? `<img src="${esc(p.image)}" alt="">` : `<img src="assets/uc_logo.png" class="uc-img" alt="">`;

        pop.innerHTML = `
          <div class="sp-icon">${icon}</div>
          <div class="sp-body">
            <strong>${rand(names)} <span class="sp-state">from ${rand(states)}</span></strong>
            <span>just topped up <b>${esc(p.name)}</b></span>
            <small><i class="sp-dot"></i>${mins} min ago · BGMI Verified ✓</small>
          </div>`;
        premiumEmoji(pop);
        pop.hidden = false;
        requestAnimationFrame(() => pop.classList.add('show'));
        setTimeout(hide, 4200);
    }

    function hide() {
        pop.classList.remove('show');
        setTimeout(() => { pop.hidden = true; }, 500);
        scheduleNext();
    }
    setTimeout(show, 5000);
}

/* ============================================================
   Banner Carousel
   ============================================================ */
function initCarousel() {
    const track = $('#carouselTrack');
    if (!track) return;
    const slides = $$('.slide', track);
    const dotsWrap = $('#carouselDots');
    const total = slides.length;
    let index = 0, timer = null;
    const INTERVAL = 4200;

    dotsWrap.innerHTML = slides.map((_, i) =>
        `<button role="tab" aria-label="Go to slide ${i + 1}"${i === 0 ? ' class="active"' : ''}></button>`
    ).join('');
    const dots = $$('button', dotsWrap);

    function go(i) {
        index = (i + total) % total;
        track.style.transform = `translateX(-${index * 100}%)`;
        dots.forEach((d, di) => d.classList.toggle('active', di === index));
    }
    const next = () => go(index + 1);
    const prev = () => go(index - 1);
    const start = () => { stop(); timer = setInterval(next, INTERVAL); };
    const stop = () => { if (timer) clearInterval(timer); };

    $('#carNext')?.addEventListener('click', () => { next(); start(); });
    $('#carPrev')?.addEventListener('click', () => { prev(); start(); });
    dots.forEach((d, i) => d.addEventListener('click', () => { go(i); start(); }));

    const carousel = $('#home');
    if (carousel) {
        carousel.addEventListener('mouseenter', stop);
        carousel.addEventListener('mouseleave', start);
        document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    }

    let startX = 0, dx = 0;
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        dx = 0;
        stop();
    }, { passive: true });
    track.addEventListener('touchmove', (e) => {
        dx = e.touches[0].clientX - startX;
    }, { passive: true });
    track.addEventListener('touchend', () => {
        if (Math.abs(dx) > 50) (dx < 0 ? next() : prev());
        start();
    });

    go(0);
    start();
}

/* ============================================================
   Character ID Verification Flow (Landing page)
   ============================================================ */
function initUidFlow() {
    const uidForm = $('#uidForm');
    if (!uidForm) return;

    const uidInput = $('#uidInput');
    const uidHint = $('#uidHint');
    const verifyBtn = $('#verifyBtn');
    const modalOverlay = $('#modalOverlay');

    const setLoading = (on) => {
        verifyBtn.disabled = on;
        $('.btn-label', verifyBtn).textContent = on ? 'Verifying Character ID…' : 'Verify Character ID';
        $('.spinner', verifyBtn).hidden = !on;
    };

    const showWarning = (msg) => {
        $('.input-wrap').classList.add('invalid');
        uidHint.classList.add('error');
        uidHint.textContent = msg;
    };
    const clearWarning = () => {
        $('.input-wrap').classList.remove('invalid');
        uidHint.classList.remove('error');
        uidHint.textContent = 'Your Character ID is located on your in-game profile page.';
    };

    uidInput.addEventListener('input', () => {
        uidInput.value = uidInput.value.replace(/\D/g, '');
        clearWarning();
    });

    uidForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = uidInput.value.trim();
        if (!/^\d{5,12}$/.test(uid)) {
            showWarning('Please enter a valid BGMI Character ID (5–12 digits).');
            return;
        }

        setLoading(true);
        clearWarning();
        try {
            const player = await fetchPlayerInfo(uid);
            state.player = player;
            savePlayer(player);
            showPlayerModal(player);
        } catch (err) {
            showWarning(err.message || 'Could not verify BGMI Character ID.');
        } finally {
            setLoading(false);
        }
    });

    function setRow(rowSel, valSel, value) {
        const row = $(rowSel);
        if (value === null || value === undefined || value === '') {
            row.hidden = true;
            return;
        }
        row.hidden = false;
        $(valSel).textContent = value;
    }

    function showPlayerModal(p) {
        $('#pNick').textContent = p.nickname;
        $('#pUid').textContent = p.uid;
        $('#pLevel').textContent = p.level;
        $('#pRegion').textContent = p.region || 'India / Asia';
        $('#pLikes').textContent = p.likes != null ? p.likes.toLocaleString('en-IN') : '—';
        setRow('#rowClan', '#pClan', p.clan);
        $('#pSub').innerHTML = p.elitePass ?
            '🎉 Congratulations — <b style="color:var(--brand)">Royale Pass ✨</b> holder verified!' :
            '🎉 Congratulations — your BGMI account is ready for UC top-up!';
        openModal(modalOverlay);
        premiumEmoji($('#playerModal'));
        launchConfetti();
    }

    $('#modalClose')?.addEventListener('click', () => closeModal(modalOverlay));
    $('#notMeBtn')?.addEventListener('click', () => {
        closeModal(modalOverlay);
        state.player = null;
        clearPlayer();
        uidInput.value = '';
        uidInput.focus();
    });

    $('#proceedBtn')?.addEventListener('click', () => {
        const verifiedPlayer = state.player;
        if (!verifiedPlayer || !verifiedPlayer.uid) {
            closeModal(modalOverlay);
            uidInput.focus();
            showWarning('Please verify your Character ID again.');
            return;
        }
        closeModal(modalOverlay);
        const isHtml = window.location.pathname.endsWith('.html') || window.location.protocol === 'file:';
        const storePath = isHtml ? 'store.html' : 'store.html';
        const target = new URL(storePath, window.location.href);
        target.searchParams.set('uid', String(verifiedPlayer.uid));
        target.searchParams.set('_v', String(Date.now()));
        window.location.assign(target.href);
    });
}

function launchConfetti() {
    const box = $('#confetti');
    if (!box) return;
    box.innerHTML = '';
    const colors = ['#f59e0b', '#ea580c', '#ffd700', '#22d3ee', '#10b981', '#ffffff'];
    for (let i = 0; i < 60; i++) {
        const c = document.createElement('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDuration = 1.5 + Math.random() * 1.5 + 's';
        c.style.animationDelay = Math.random() * 0.4 + 's';
        c.style.transform = `rotate(${Math.random() * 360}deg)`;
        box.appendChild(c);
    }
}

/* ============================================================
   BGMI Store (store page only)
   ============================================================ */
const BGMI_FALLBACK_CATS = [
    { slug: 'uc', name: 'Unknown Cash (UC)', icon: '<img src="assets/uc_logo.png" class="tab-ic" alt="UC">' },
    { slug: 'passes', name: 'Royale Pass', icon: '<img src="assets/royale_pass.png" class="tab-ic" alt="RP">' },
    { slug: 'membership', name: 'Subscriptions', icon: '<img src="assets/prime_plus.png" class="tab-ic" alt="Prime">' },
    { slug: 'special', name: 'Crates & Bundles', icon: '✨' },
];

async function loadCatalogue() {
    try {
        const res = await fetch(getApiUrl('/api/products'), { cache: 'no-store' });
        const data = await res.json();
        // If the backend products contain UC or BGMI categories, use backend categories
        if (data && data.ok && Array.isArray(data.categories) && data.categories.length) {
            const hasBgmi = data.categories.some(c => c.slug === 'uc' || (c.name && c.name.toLowerCase().includes('uc')));
            if (hasBgmi) {
                data.categories.forEach(c => {
                    if (c.image) c.image = getMediaUrl(c.image);
                    if (Array.isArray(c.items)) {
                        c.items.forEach(p => {
                            if (p.image) p.image = getMediaUrl(p.image);
                        });
                    }
                });
                return { categories: data.categories, demo: false };
            }
        }
    } catch (_) {}

    // Default to the dedicated BGMI UC catalogue
    const cats = BGMI_FALLBACK_CATS
        .filter(c => window.PRODUCTS && window.PRODUCTS[c.slug])
        .map(c => ({
            ...c,
            items: window.PRODUCTS[c.slug]
        }));
    return { categories: cats, demo: true };
}

async function initStore() {
    const grid = $('#productGrid');
    if (!grid) return;

    if (!state.player) {
        const queryUid = new URLSearchParams(window.location.search).get('uid') || '';
        if (/^\d{5,12}$/.test(queryUid)) {
            try {
                state.player = await fetchPlayerInfo(queryUid);
                savePlayer(state.player);
            } catch (_) {}
        }
    }

    if (!state.player) {
        const landing = new URL('index.html', window.location.href);
        window.location.replace(landing.href);
        return;
    }

    const player = state.player;
    if ($('#vNick')) $('#vNick').textContent = player.nickname;
    if ($('#vUid')) $('#vUid').textContent = player.uid;
    if ($('#vLevel')) $('#vLevel').textContent = `Lvl ${player.level}`;

    $('#changeAccount')?.addEventListener('click', (e) => {
        e.preventDefault();
        clearPlayer();
        window.location.href = 'index.html';
    });

    const { categories } = await loadCatalogue();
    const catMap = {};
    categories.forEach(c => {
        catMap[c.slug] = c.items || [];
    });

    // Build tabs
    const tabsWrap = $('#tabs');
    tabsWrap.innerHTML = categories.map((c, i) =>
        `<button class="tab ${i === 0 ? 'active' : ''}" data-cat="${c.slug}">` +
        `${c.image ? `<img class="tab-ic" src="${esc(c.image)}" alt="">` : (c.icon || '')} ${esc(c.name)}</button>`
    ).join('');
    premiumEmoji(tabsWrap);

    const findProductLocal = (id) =>
        Object.values(catMap).flat().find(p => p.id === id);

    function renderProducts(slug) {
        const items = catMap[slug] || [];
        grid.innerHTML = items.map((p, i) => {
            const out = p.inStock === false;
            const stockLine = out ?
                `<span class="p-stock out">Out of stock</span>` :
                `<span class="p-stock${(p.stock ?? 0) <= 10 ? ' low' : ''}">${p.stock} packs left</span>`;
            
            const rawTag = typeof p.tag === 'string' ? p.tag.trim() : '';
            const tagInfo = (() => {
                if (!rawTag) return null;
                const key = rawTag.toLowerCase();
                if (key.includes('best') || key.includes('popular')) return { cls: 'best', text: rawTag };
                if (key.includes('hot')) return { cls: 'hot', text: rawTag };
                if (key.includes('limited')) return { cls: 'limited', text: rawTag };
                if (key.includes('vip') || key.includes('mega')) return { cls: 'new', text: rawTag };
                return { cls: 'custom', text: rawTag };
            })();

            const itemIcon = p.image ?
                `<img class="p-img" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` :
                `<img class="p-img" src="assets/uc_logo.png" alt="UC" loading="lazy">`;

            return `
      <article class="product${out ? ' is-out' : ''}" data-id="${p.id}" style="animation-delay:${i * 60}ms">
        ${out ? '<span class="out-badge">Out of stock</span>' : (tagInfo ? `<span class="tag ${tagInfo.cls}">${esc(tagInfo.text)}</span>` : '')}
        <div class="p-icon">${itemIcon}</div>
        <div class="p-amount">${esc(p.amount)}</div>
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-sub">${esc(p.sub)}</div>
        ${stockLine}
        <div class="p-foot">
          <div class="p-price">${money(p.price)}${p.old ? `<span class="p-old">${money(p.old)}</span>` : ''}</div>
          <span class="p-buy">${out ? 'Sold out' : 'Get UC →'}</span>
        </div>
      </article>`;
        }).join('') || '<p class="muted center">No products in this category yet.</p>';

        $$('.product', grid).forEach(el => el.addEventListener('click', () => {
            const prod = findProductLocal(el.dataset.id);
            if (!prod || prod.inStock === false) {
                toast('This item is currently out of stock.', 'err');
                return;
            }
            startPayment(prod);
        }));
        premiumEmoji(grid);
    }

    tabsWrap.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        $$('.tab', tabsWrap).forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderProducts(tab.dataset.cat);
    });

    renderProducts(categories[0]?.slug);
    initPayModal(player);
}

/* ============================================================
   Payment deep links & UPI Integration
   ============================================================ */
const PAYMENT_CONFIG = {
    merchantName: 'BGMI Official Store',
    upi: 'BHARATPE.8E0P0N7O0Y20773@fbpe',
};

async function syncPaymentConfig() {
    try {
        const res = await fetch(getApiUrl('/api/config'), { cache: 'no-store' });
        if (res.ok) {
            const cfg = await res.json();
            if (cfg.upi) PAYMENT_CONFIG.upi = cfg.upi;
            if (cfg.merchant_name) PAYMENT_CONFIG.merchantName = cfg.merchant_name;
        }
    } catch (_) {}
}
syncPaymentConfig();

let payCtx = null;

function initPayModal(player) {
    const overlay = $('#payOverlay');
    $('#payClose')?.addEventListener('click', closePayment);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closePayment(); });

    window.startPayment = (product) => {
        if (!product) return;
        showDeepLinkPayment(product, player);
    };
}

function showDeepLinkPayment(product, player) {
    const overlay = $('#payOverlay');
    const amount = Number(product.price) || 0;
    let selectedMethod = 'phonepe';
    openModal(overlay);

    const render = () => {
        const methods = [
            { id: 'phonepe', name: 'PhonePe', tag: 'Fastest', icon: 'assets/payment/phonepe.svg' },
            { id: 'paytm', name: 'Paytm', tag: '', icon: 'assets/payment/paytm_icon.svg' },
            { id: 'upi', name: 'Other UPI App', tag: '', icon: 'assets/payment/bhim.png' },
            { id: 'qr', name: 'Scan UPI QR Code', tag: 'Works with any app', icon: 'assets/payment/qr.png' },
        ];
        $('#payBody').innerHTML = `
          <h3 class="modal-title">Choose Payment Method</h3>
          <p class="modal-sub">Select your preferred UPI app to continue securely.</p>
          <div class="checkout-summary">
            <div class="cs-row"><span>BGMI Player</span><strong>${esc(player.nickname)}</strong></div>
            <div class="cs-row"><span>Character ID</span><strong>${esc(player.uid)}</strong></div>
            <div class="cs-row"><span>Item</span><strong><img src="assets/uc_logo.png" class="uc-img" alt=""> ${esc(product.name)}</strong></div>
            <div class="cs-row total"><span>Total Amount</span><strong>${money(amount)}</strong></div>
          </div>
          <div class="deep-payment-options" role="radiogroup" aria-label="Payment methods">
            ${methods.map((m, i) => `<button type="button" class="deep-payment-option${i === 0 ? ' selected' : ''}" data-method="${m.id}" role="radio" aria-checked="${i === 0 ? 'true' : 'false'}"><span class="deep-payment-left"><span class="deep-payment-icon"><img src="${m.icon}" alt=""></span><span><b>${m.name}</b>${m.tag ? `<small>${m.tag}</small>` : ''}</span></span><span class="deep-payment-radio"></span></button>`).join('')}
          </div>
          <button class="btn btn-primary btn-block" id="deepPayBtn">Pay ${money(amount)} →</button>
          <p class="muted center">You will be redirected to your payment app. Unknown Cash will be credited directly to your Character ID.</p>
          <button class="btn btn-text" type="button" id="deepCancelBtn">Cancel</button>`;

        $$('.deep-payment-option', $('#payBody')).forEach((btn) => btn.addEventListener('click', () => {
            selectedMethod = btn.dataset.method;
            $$('.deep-payment-option', $('#payBody')).forEach((b) => {
                const active = b === btn;
                b.classList.toggle('selected', active);
                b.setAttribute('aria-checked', active ? 'true' : 'false');
            });
        }));
        $('#deepPayBtn').addEventListener('click', () => launchPaymentDeepLink(selectedMethod, amount, product, player));
        $('#deepCancelBtn').addEventListener('click', closePayment);
    };
    render();
}

function launchPaymentDeepLink(method, amount, product, player) {
    const txnId = 'BGMI' + Date.now() + Math.floor(Math.random() * 900 + 100);
    const note = `${product.name} - BGMI ID ${player.uid} - ${txnId}`;
    const amt = amount.toFixed(2);
    const vpa = encodeURIComponent(PAYMENT_CONFIG.upi);
    const merchant = encodeURIComponent(PAYMENT_CONFIG.merchantName);
    let redirectUrl;

    if (method === 'qr') {
        showQrPayment(amount, product, player, txnId, note);
        return;
    }
    if (method === 'phonepe') {
        const payload = {
            p2pPaymentCheckoutParams: {
                checkoutType: 'COLLECT',
                initialAmount: Math.round(amount * 100),
                note: { type: 'text', message: note },
                supportedInstruments: -1,
            },
            contact: { type: 'EXTERNAL_MERCHANT', name: PAYMENT_CONFIG.merchantName, vpa: PAYMENT_CONFIG.upi },
        };
        redirectUrl = `phonepe://native?data=${encodeURIComponent(btoa(JSON.stringify(payload)))}&id=p2ppayment`;
    } else if (method === 'paytm') {
        redirectUrl = `paytmmp://cash_wallet?pa=${vpa}&pn=${merchant}&am=${amt}&cu=INR&tn=${encodeURIComponent(note)}&featuretype=money_transfer`;
    } else if (method === 'upi') {
        redirectUrl = `upi://pay?pa=${vpa}&pn=${merchant}&am=${amt}&cu=INR&tr=${encodeURIComponent(txnId)}&tn=${encodeURIComponent(note)}`;
    }

    $('#payBody').innerHTML = `<div class="pay-loading"><span class="spinner big"></span><p>Opening payment app…</p></div>`;
    window.location.href = redirectUrl;
    setTimeout(() => {
        $('#payBody').innerHTML = `
          <div class="success-ring"><span class="check">↗</span></div>
          <h3 class="modal-title">Payment App Opened</h3>
          <p class="modal-sub">Please complete the payment in your selected app. Once completed, your UC will be delivered to your account.</p>
          <button class="btn btn-primary btn-block" type="button" id="backToMethods">Back to Payment Options</button>
          <button class="btn btn-text" type="button" id="closeAfterRedirect">Close</button>`;
        $('#backToMethods').addEventListener('click', () => showDeepLinkPayment(product, player));
        $('#closeAfterRedirect').addEventListener('click', closePayment);
    }, 1800);
}

function showQrPayment(amount, product, player, txnId, note) {
    const qrUri = `upi://pay?pa=${encodeURIComponent(PAYMENT_CONFIG.upi)}&pn=${encodeURIComponent(PAYMENT_CONFIG.merchantName)}&am=${amount.toFixed(2)}&cu=INR&tr=${encodeURIComponent(txnId)}&tn=${encodeURIComponent(note)}`;
    const qrUrl = getApiUrl(`/api/qr?s=280&d=${encodeURIComponent(qrUri)}`);
    clearPaymentTimer();
    $('#payBody').innerHTML = `
      <button class="modal-close qr-close" id="qrClose" aria-label="Close">✕</button>
      <h3 class="modal-title">Scan & Pay for UC</h3>
      <p class="modal-sub">Scan this fresh QR code using any UPI app.</p>
      <div class="qr-box"><img class="generated-qr" src="${esc(qrUrl)}" alt="UPI payment QR" width="280" height="280"></div>
      <div class="pay-amount">${money(amount)}</div>
      <div class="checkout-summary">
        <div class="cs-row"><span>BGMI Player</span><strong>${esc(player.nickname)}</strong></div>
        <div class="cs-row"><span>Character ID</span><strong>${esc(player.uid)}</strong></div>
        <div class="cs-row"><span>Item</span><strong><img src="assets/uc_logo.png" class="uc-img" alt=""> ${esc(product.name)}</strong></div>
      </div>
      <p class="pay-status">QR expires in <span id="qrTimer">6:00</span></p>
      <button class="btn btn-primary btn-block" id="qrBackBtn" type="button">Back to Payment Methods</button>`;

    $('#qrClose').addEventListener('click', () => showDeepLinkPayment(product, player));
    $('#qrBackBtn').addEventListener('click', () => showDeepLinkPayment(product, player));

    let remaining = 360;
    const tick = () => {
        const timer = $('#qrTimer');
        const m = Math.floor(remaining / 60);
        const s = String(remaining % 60).padStart(2, '0');
        if (timer) timer.textContent = `${m}:${s}`;
        if (remaining <= 0) {
            clearPaymentTimer();
            $('#payBody').innerHTML = `
              <h3 class="modal-title">QR Expired</h3>
              <p class="modal-sub">This QR code was valid for six minutes. Please generate a fresh QR code.</p>
              <button class="btn btn-primary btn-block" id="qrRetryBtn" type="button">Choose Payment Method</button>`;
            $('#qrRetryBtn').addEventListener('click', () => showDeepLinkPayment(product, player));
            return;
        }
        remaining -= 1;
    };
    tick();
    payCtx = setInterval(tick, 1000);
}

function clearPaymentTimer() {
    if (payCtx) { clearInterval(payCtx); clearTimeout(payCtx); payCtx = null; }
}

function closePayment() {
    clearPaymentTimer();
    closeModal($('#payOverlay'));
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

/* ============================================================
   FAQ accordion
   ============================================================ */
function initFaq() {
    $$('.acc-q').forEach(q =>
        q.addEventListener('click', () => {
            const item = q.parentElement;
            const open = item.classList.contains('open');
            $$('.acc-item').forEach(i => {
                i.classList.remove('open');
                $('.acc-a', i).style.maxHeight = null;
            });
            if (!open) {
                item.classList.add('open');
                $('.acc-a', item).style.maxHeight = $('.acc-a', item).scrollHeight + 'px';
            }
        })
    );
}

function init() {
    initTheme();
    initNav();
    initModals();
    initCarousel();
    initUidFlow();
    initStore();
    initFaq();
    initSalePops();
    initReveal();
    premiumEmoji();
    const y = $('#year');
    if (y) y.textContent = new Date().getFullYear();
}
init();
