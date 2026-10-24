/* ============================================================
   FireTopUp — front-end logic (multi-page)
   ------------------------------------------------------------
   Pages:
     index.html  → landing + UID verification
     store.html  → store (only reachable after UID is verified)

   👉 ONLY THING YOU NEED TO SWAP WHEN YOUR REAL API ARRIVES:
      the fetchPlayerInfo() function below.
   ============================================================ */

// ============================================================
// 🔥 BACKEND API CONFIGURATION (Cloudflare Tunnel Domain)
// Set to your domain: https://ff-topupp.shop
// If you host the backend on a subdomain (e.g. https://api.ff-topupp.shop), update it here.
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
    // Set USE_MOCK = true to test without hitting the live API.
    USE_MOCK: false,

    // Live Free Fire player-info endpoint. {UID} is replaced with the entered UID.
    API_URL: '/api/verify?uid={UID}',

    // Extra request headers (none required for this API).
    API_HEADERS: {},

    CURRENCY: '₹',
};

/* ------------------------------------------------------------
   API: fetch the player's info by UID.
   Resolves to: { nickname, uid, level, region, likes, clan, elitePass }
   Throws an Error if the UID is invalid / not found.
   ------------------------------------------------------------ */
async function fetchPlayerInfo(uid) {
    if (CONFIG.USE_MOCK) return mockPlayerInfo(uid);
    return await fetchPlayerFrom(CONFIG.API_URL, uid);
}

/* Fetch + normalise a single endpoint. Throws on failure, returns a player. */
async function fetchPlayerFrom(urlTemplate, uid) {
    let url = urlTemplate.replace('{UID}', encodeURIComponent(uid));
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = getApiUrl(url);
    }
    let res;
    try {
        res = await fetch(url, {
            headers: CONFIG.API_HEADERS
        });
    } catch (_) {
        throw new Error('Network error — please check your connection and try again.');
    }
    if (!res.ok) throw new Error('UID not found. Please check your UID and try again.');

    let data;
    try {
        data = await res.json();
    } catch (_) {
        throw new Error('UID not found. Please check your UID and try again.');
    }

    if (data && data.status === 'proxy_error') {
        throw new Error(data.message || 'Verification service is temporarily unavailable. Please try again.');
    }

    const player = normalizePlayer(data, uid);
    if (!player) throw new Error('UID not found. Please check your UID and try again.');
    return player;
}

/* First non-empty value among the given keys of an object. */
function pickField(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
}

/* Map various Free Fire API response shapes to our player object. Returns null
   if no usable nickname is found (treated as "not found"). */
function normalizePlayer(data, uid) {
    if (!data || typeof data !== 'object') return null;

    const d = data.data && typeof data.data === 'object' ? data.data : data;
    // Where the player fields usually live across the common API formats.
    const info = data.basicinfo || data.basicInfo || d.basicInfo || d.basicinfo ||
        d.AccountInfo || d.account || d.profile || d.player || d;
    const clan = data.clanbasicinfo || data.clanBasicInfo || d.clanBasicInfo ||
        d.ClanInfo || d.clan || {};

    const nickname = pickField(info, ['nickname', 'name', 'AccountName', 'username', 'nick']) ||
        pickField(data, ['nickname', 'name', 'AccountName']);
    if (!nickname) return null;

    const accountId = pickField(info, ['accountid', 'accountId', 'AccountId', 'uid', 'id', 'AccountUID']) ||
        pickField(data, ['accountid', 'accountId', 'uid', 'id']);
    const level = pickField(info, ['level', 'AccountLevel', 'lvl']);
    const region = pickField(info, ['region', 'AccountRegion', 'Region']);
    const liked = pickField(info, ['liked', 'likes', 'AccountLikes', 'like']);
    const elite = pickField(info, ['haselitepass', 'hasElitePass', 'elitePass', 'ElitePass']);
    const clanName = pickField(clan, ['clanname', 'clanName', 'ClanName', 'name']);

    return {
        nickname: String(nickname),
        uid: accountId != null ? String(accountId) : String(uid),
        level: level != null ? level : '—',
        region: region || '—',
        likes: typeof liked === 'number' ? liked : (liked != null && !isNaN(+liked) ? +liked : null),
        clan: clanName ? String(clanName).trim() : null,
        elitePass: !!elite,
    };
}

/* Mock used until the real API is wired in. Generates believable data. */
function mockPlayerInfo(uid) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (!/^\d{6,12}$/.test(uid)) {
                reject(new Error('UID not found. Make sure it is 6–12 digits.'));
                return;
            }
            const names = ['ShadowSlayer', 'BooyahKing', 'PhantomX', 'GhostRider', 'NoScopeRaj', 'DesiGamerz', 'ProBunny', 'IcyBlaze', 'VortexFF', 'LegendAryan'];
            const regions = ['IND', 'SG', 'BR', 'ID', 'ME'];
            const seed = [...uid].reduce((a, c) => a + (+c), 0);
            resolve({
                nickname: names[seed % names.length] + (seed % 97),
                uid,
                level: 20 + (seed % 60),
                region: regions[seed % regions.length],
            });
        }, 1100); // simulate network
    });
}

/* ============================================================
   Helpers
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => `${CONFIG.CURRENCY}${n.toLocaleString('en-IN')}`;

/* Verified player is shared across pages via sessionStorage */
const PLAYER_KEY = 'ff_player';
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
    currentCat: 'diamonds',
    selected: null
};

/* Replace OS emoji with crisp premium Twemoji stickers */
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

/* ============================================================
   Modal helpers
   ============================================================ */
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
   Dark / light theme toggle (persisted)
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
            localStorage.setItem('ff_theme', root.classList.contains('dark') ? 'dark' : 'light');
        } catch (_) {}
        setIcon();
    });
}

/* ============================================================
   Header nav (mobile menu)
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
    $$('[data-scroll]').forEach(b =>
        b.addEventListener('click', () => $(b.dataset.scroll)?.scrollIntoView({
            behavior: 'smooth'
        }))
    );
}

/* ============================================================
   Reveal on scroll
   ============================================================ */
const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
        }
    });
}, {
    threshold: 0.15
});

function initReveal() {
    $$('.section-head, .step, .uid-card, .acc-item').forEach(el => {
        el.classList.add('reveal');
        io.observe(el);
    });
}

/* ============================================================
   Purchase activity popup (enabled by request)
   ============================================================ */
function initSalePops() {
    const names = ['Rahul', 'Aman', 'Arjun', 'Karan', 'Rohit', 'Vikram', 'Sahil', 'Aditya', 'Dev', 'Kabir', 'Ishaan', 'Sanjay', 'Aryan', 'Rohan', 'Akash', 'Manish', 'Nikhil', 'Yash', 'Harsh', 'Raj', 'Ankit', 'Varun', 'Siddharth', 'Gaurav', 'Priya', 'Sneha', 'Neha', 'Ananya', 'Riya'];
    const states = ['Delhi', 'Maharashtra', 'Uttar Pradesh', 'Karnataka', 'Tamil Nadu', 'West Bengal', 'Gujarat', 'Rajasthan', 'Punjab', 'Bihar', 'Madhya Pradesh', 'Haryana', 'Kerala', 'Telangana', 'Andhra Pradesh', 'Assam', 'Odisha', 'Jharkhand', 'Chhattisgarh', 'Goa'];
    const rand = (a) => a[Math.floor(Math.random() * a.length)];
    let products = Object.values(window.PRODUCTS || {}).flat();
    fetch(getApiUrl('/api/products'), { cache: 'no-store' }).then(r => r.json()).then(d => {
        if (d && d.ok && Array.isArray(d.categories)) {
            const items = d.categories.flatMap(c => c.items || []);
            if (items.length) products = items;
        }
    }).catch(() => {});
    const pop = document.createElement('div');
    pop.className = 'sale-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
    const scheduleNext = () => setTimeout(show, 6000);
    function show() {
        const pay = document.getElementById('payOverlay');
        if (pay && !pay.hidden) { scheduleNext(); return; }
        if (!products.length) { scheduleNext(); return; }
        const p = rand(products);
        const mins = 1 + Math.floor(Math.random() * 12);
        const icon = p.image ? `<img src="${esc(p.image)}" alt="">` : (p.icon || '🎮');
        pop.innerHTML = `<div class="sp-icon">${icon}</div><div class="sp-body"><strong>${rand(names)} <span class="sp-state">from ${rand(states)}</span></strong><span>just bought <b>${esc(p.name)}</b></span><small><i class="sp-dot"></i>${mins} min ago · Verified ✓</small></div>`;
        premiumEmoji(pop);
        pop.hidden = false;
        requestAnimationFrame(() => pop.classList.add('show'));
        setTimeout(hide, 4000);
    }
    function hide() {
        pop.classList.remove('show');
        setTimeout(() => { pop.hidden = true; }, 500);
        scheduleNext();
    }
    setTimeout(show, 6000);
}

/* ============================================================
   Banner carousel — auto-slide every 4s  (landing only)
   ============================================================ */
function initCarousel() {
    const track = $('#carouselTrack');
    if (!track) return;
    const slides = $$('.slide', track);
    const dotsWrap = $('#carouselDots');
    const total = slides.length;
    let index = 0,
        timer = null;
    const INTERVAL = 4000;

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
    const start = () => {
        stop();
        timer = setInterval(next, INTERVAL);
    };
    const stop = () => {
        if (timer) clearInterval(timer);
    };

    $('#carNext').addEventListener('click', () => {
        next();
        start();
    });
    $('#carPrev').addEventListener('click', () => {
        prev();
        start();
    });
    dots.forEach((d, i) => d.addEventListener('click', () => {
        go(i);
        start();
    }));

    const carousel = $('#home');
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

    let startX = 0,
        dx = 0;
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        dx = 0;
        stop();
    }, {
        passive: true
    });
    track.addEventListener('touchmove', (e) => {
        dx = e.touches[0].clientX - startX;
    }, {
        passive: true
    });
    track.addEventListener('touchend', () => {
        if (Math.abs(dx) > 50)(dx < 0 ? next() : prev());
        start();
    });

    go(0);
    start();
}

/* ============================================================
   UID verification flow  (landing only)
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
        $('.btn-label', verifyBtn).textContent = on ? 'Verifying…' : 'Verify UID';
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
        uidHint.textContent = 'Your UID is shown on your in-game profile.';
    };

    uidInput.addEventListener('input', () => {
        uidInput.value = uidInput.value.replace(/\D/g, '');
        clearWarning();
    });

    uidForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = uidInput.value.trim();
        if (!/^\d{6,12}$/.test(uid)) {
            showWarning('Please enter a valid UID (6–12 digits).');
            return;
        }

        setLoading(true);
        clearWarning();
        try {
            const player = await fetchPlayerInfo(uid);
            state.player = player;
            savePlayer(player); // persist for the store page
            showPlayerModal(player);
        } catch (err) {
            showWarning(err.message || 'Could not verify UID.');
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
        $('#pRegion').textContent = p.region;
        $('#pLikes').textContent = p.likes != null ? p.likes.toLocaleString('en-IN') : '—';
        setRow('#rowClan', '#pClan', p.clan);
        $('#pSub').innerHTML = p.elitePass ?
            '🎉 Congratulations — <b style="color:var(--brand-2)">Elite Pass ✨</b> holder!' :
            '🎉 Congratulations — your account is ready!';
        openModal(modalOverlay);
        premiumEmoji($('#playerModal'));
        launchConfetti();
    }

    $('#modalClose').addEventListener('click', () => closeModal(modalOverlay));
    $('#notMeBtn').addEventListener('click', () => {
        closeModal(modalOverlay);
        state.player = null;
        clearPlayer();
        uidInput.value = '';
        uidInput.focus();
    });
    // Proceed → go to the separate store page
    $('#proceedBtn').addEventListener('click', () => {
        const verifiedPlayer = state.player;
        if (!verifiedPlayer || !verifiedPlayer.uid) {
            closeModal(modalOverlay);
            uidInput.focus();
            showWarning('Please verify your UID again.');
            return;
        }
        closeModal(modalOverlay);
        const storePath = window.location.protocol === 'file:' ? 'store.html' : '/store';
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
    const colors = ['#ff7a18', '#ff3d3d', '#7b5cff', '#22d3ee', '#22c55e', '#ffd700'];
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
   Store  (store page only — guarded by UID verification)
   ============================================================ */
const API_BASE = 'api/';

/** Fallback catalogue labels when the API is unreachable (demo mode). */
const FALLBACK_CATS = [{
        slug: 'diamonds',
        name: 'Diamonds',
        icon: '💎'
    },
    {
        slug: 'passes',
        name: 'Passes',
        icon: '🎟️'
    },
    {
        slug: 'membership',
        name: 'Membership',
        icon: '👑'
    },
    {
        slug: 'special',
        name: 'Special',
        icon: '✨'
    },
];

/** Full-screen blocker shown when the site's access has expired. */
function showServiceUnavailable() {
    document.body.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem;font-family:Inter,system-ui,sans-serif">' +
        '<div>' +
        '<div style="font-size:3rem;margin-bottom:.5rem">⌛</div>' +
        '<h1 style="margin:.2rem 0;font-size:1.4rem">Service unavailable</h1>' +
        '<p style="color:#888;max-width:24rem">This service is temporarily unavailable. Please check back later.</p>' +
        '</div>' +
        '</div>';
}

async function loadCatalogue() {
    try {
        const res = await fetch(getApiUrl('/api/products'), {
            cache: 'no-store'
        });
        const data = await res.json();
        if (data && data.expired) return {
            categories: [],
            demo: false,
            expired: true
        };
        if (data && data.ok && Array.isArray(data.categories) && data.categories.length) {
            data.categories.forEach(c => {
                if (c.image) c.image = getMediaUrl(c.image);
                if (Array.isArray(c.items)) {
                    c.items.forEach(p => {
                        if (p.image) p.image = getMediaUrl(p.image);
                    });
                }
            });
            return {
                categories: data.categories,
                demo: false
            };
        }
        throw new Error('empty');
    } catch (_) {
        // Demo fallback to the static data.js catalogue
        const cats = FALLBACK_CATS
            .filter(c => window.PRODUCTS && window.PRODUCTS[c.slug])
            .map(c => ({ ...c,
                items: window.PRODUCTS[c.slug]
            }));
        return {
            categories: cats,
            demo: true
        };
    }
}

async function initStore() {
    const grid = $('#productGrid');
    if (!grid) return;

    // KSWeb/local PHP can isolate sessionStorage between page loads. Recover the
    // verified player from localStorage or the UID handoff query before gating.
    if (!state.player) {
        const queryUid = new URLSearchParams(window.location.search).get('uid') || '';
        if (/^\d{6,12}$/.test(queryUid)) {
            try {
                state.player = await fetchPlayerInfo(queryUid);
                savePlayer(state.player);
            } catch (_) {}
        }
    }
    if (!state.player) {
        const landing = new URL('/', window.location.href);
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
        window.location.href = '/';
    });

    const {
        categories,
        demo,
        expired
    } = await loadCatalogue();
    if (expired) {
        showServiceUnavailable();
        return;
    }
    state.demo = demo;
    const catMap = {};
    categories.forEach(c => {
        catMap[c.slug] = c.items || [];
    });

    // Build tabs dynamically (admin-defined categories)
    const tabsWrap = $('#tabs');
    tabsWrap.innerHTML = categories.map((c, i) =>
        `<button class="tab ${i === 0 ? 'active' : ''}" data-cat="${c.slug}">` +
        `${c.image ? `<img class="tab-ic" src="${esc(c.image)}" alt="">` : c.icon} ${esc(c.name)}</button>`
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
                `<span class="p-stock${(p.stock ?? 0) <= 10 ? ' low' : ''}">${p.stock} in stock</span>`;
            const rawTag = typeof p.tag === 'string' ? p.tag.trim() : '';
            const tagInfo = (() => {
                if (!rawTag) return null;
                const key = rawTag.toLowerCase();
                if (key === 'best' || key.includes('best')) return { cls: 'best', text: rawTag === 'best' ? 'Best value' : rawTag };
                if (key === 'hot' || key.includes('hot')) return { cls: 'hot', text: rawTag === 'hot' ? 'Hot' : rawTag };
                if (key.includes('new')) return { cls: 'new', text: rawTag };
                if (key.includes('limited')) return { cls: 'limited', text: rawTag };
                return { cls: 'custom', text: rawTag };
            })();
            return `
      <article class="product${out ? ' is-out' : ''}" data-id="${p.id}" style="animation-delay:${i * 60}ms">
        ${out ? '<span class="out-badge">Out of stock</span>' : (tagInfo ? `<span class="tag ${tagInfo.cls}">${esc(tagInfo.text)}</span>` : '')}
        <div class="p-icon">${p.image ? `<img class="p-img" src="${esc(p.image)}" alt="" loading="lazy">` : p.icon}</div>
        <div class="p-amount">${p.amount}</div>
        <div class="p-name">${p.name}</div>
        <div class="p-sub">${p.sub}</div>
        ${stockLine}
        <div class="p-foot">
          <div class="p-price">${money(p.price)}${p.old ? `<span class="p-old">${money(p.old)}</span>` : ''}</div>
          <span class="p-buy">${out ? 'Sold out' : 'Buy →'}</span>
        </div>
      </article>`;
        }).join('') || '<p class="muted center">No products in this category yet.</p>';
        $$('.product', grid).forEach(el => el.addEventListener('click', () => {
            const prod = findProductLocal(el.dataset.id);
            if (!prod || prod.inStock === false) {
                toast('This item is out of stock.', 'err');
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
   🔥 PAYMENT FLOW WITH DISCOUNT 🔥
   ============================================================ */

// ============================================================
// 🔥 HAR PRODUCT KA ALAG DISCOUNT 🔥
// ============================================================
const DISCOUNTS = {
    'diamond_100': 5,
    'diamond_310': 10,
    'diamond_520': 12,
    'diamond_1060': 15,
    'diamond_2180': 18,
    'booyah_pass': 8,
    'elite_pass': 10,
    'weekly_membership': 7,
    'monthly_membership': 12
};

const PAYMENT_CONFIG = {
    merchantName: 'Garena Top Up',
    upi: 'BHARATPE.8E0P0N7O0Y20773@fbpe',
};

// Automatically sync latest UPI & merchant name from backend config
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
            { id: 'upi', name: 'Other UPI app', tag: '', icon: 'assets/payment/bhim.png' },
            { id: 'qr', name: 'Scan QR Code', tag: 'Works with any UPI app', icon: 'assets/payment/qr.png' },
        ];
        $('#payBody').innerHTML = `
          <h3 class="modal-title">Choose payment method</h3>
          <p class="modal-sub">Select an app to continue securely.</p>
          <div class="checkout-summary">
            <div class="cs-row"><span>Account</span><strong>${esc(player.nickname)}</strong></div>
            <div class="cs-row"><span>UID</span><strong>${esc(player.uid)}</strong></div>
            <div class="cs-row"><span>Item</span><strong>${product.image ? '' : esc(product.icon || '🎮') + ' '}${esc(product.name)}</strong></div>
            <div class="cs-row total"><span>Total</span><strong>${money(amount)}</strong></div>
          </div>
          <div class="deep-payment-options" role="radiogroup" aria-label="Payment methods">
            ${methods.map((m, i) => `<button type="button" class="deep-payment-option${i === 0 ? ' selected' : ''}" data-method="${m.id}" role="radio" aria-checked="${i === 0 ? 'true' : 'false'}"><span class="deep-payment-left"><span class="deep-payment-icon"><img src="${m.icon}" alt=""></span><span><b>${m.name}</b>${m.tag ? `<small>${m.tag}</small>` : ''}</span></span><span class="deep-payment-radio"></span></button>`).join('')}
          </div>
          <button class="btn btn-primary btn-block" id="deepPayBtn">Pay ${money(amount)} →</button>
          <p class="muted center">You will be redirected to your selected payment app. Payment confirmation is handled by the payment app/provider.</p>
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
    const txnId = 'FT' + Date.now() + Math.floor(Math.random() * 900 + 100);
    const note = `${product.name} - UID ${player.uid} - ${txnId}`;
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
        $('#payBody').innerHTML = `<div class="success-ring"><span class="check">↗</span></div><h3 class="modal-title">Payment app opened</h3><p class="modal-sub">Complete the payment in your selected app. This page cannot verify payment merely from an app redirect.</p><button class="btn btn-primary btn-block" type="button" id="backToMethods">Back to payment options</button><button class="btn btn-text" type="button" id="closeAfterRedirect">Close</button>`;
        $('#backToMethods').addEventListener('click', () => showDeepLinkPayment(product, player));
        $('#closeAfterRedirect').addEventListener('click', closePayment);
    }, 1800);
}

function showQrPayment(amount, product, player, txnId, note) {
    const qrUri = `upi://pay?pa=${encodeURIComponent(PAYMENT_CONFIG.upi)}&pn=${encodeURIComponent(PAYMENT_CONFIG.merchantName)}&am=${amount.toFixed(2)}&cu=INR&tr=${encodeURIComponent(txnId)}&tn=${encodeURIComponent(note)}`;
    const qrUrl = getApiUrl(`/api/qr?s=280&d=${encodeURIComponent(qrUri)}`);
    clearPaymentTimer();
    $('#payBody').innerHTML = `<button class="modal-close qr-close" id="qrClose" aria-label="Close">✕</button><h3 class="modal-title">Scan & Pay</h3><p class="modal-sub">Scan this fresh QR using any UPI app.</p><div class="qr-box"><img class="generated-qr" src="${esc(qrUrl)}" alt="UPI payment QR" width="280" height="280"></div><div class="pay-amount">${money(amount)}</div><div class="checkout-summary"><div class="cs-row"><span>Account</span><strong>${esc(player.nickname)}</strong></div><div class="cs-row"><span>UID</span><strong>${esc(player.uid)}</strong></div><div class="cs-row"><span>Item</span><strong>${esc(product.name)}</strong></div></div><p class="pay-status">QR expires in <span id="qrTimer">6:00</span></p><button class="btn btn-primary btn-block" id="qrBackBtn" type="button">Back to payment methods</button>`;
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
            $('#payBody').innerHTML = `<h3 class="modal-title">QR expired</h3><p class="modal-sub">This QR was valid for six minutes. Select the QR option again to create a fresh one.</p><button class="btn btn-primary btn-block" id="qrRetryBtn" type="button">Choose payment method</button>`;
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

function launchConfettiInto(container) {
    const box = document.createElement('div');
    box.className = 'confetti';
    container.prepend(box);
    const colors = ['#ff7a18', '#ff3d3d', '#7b5cff', '#22d3ee', '#22c55e', '#ffd700'];
    for (let i = 0; i < 50; i++) {
        const c = document.createElement('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDuration = 1.5 + Math.random() * 1.5 + 's';
        c.style.animationDelay = Math.random() * 0.3 + 's';
        box.appendChild(c);
    }
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

/* ============================================================
   Init (runs on every page; each module guards itself)
   ============================================================ */
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