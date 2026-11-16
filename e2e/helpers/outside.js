'use strict';

// 바깥 요청 막기 파일, 광고·분석·토스 주소로 가는 브라우저 요청을 기본으로 막음 (진짜 광고 계정·결제사로 안 나가게)
// fixtures.js(브라우저가 만드는 창마다)·playwright.config.js(크로미움 주소 찾기 막기)·global-setup.js(막기 확인)·serve-front.js(가짜 광고 값)가 씀
//
// 막는 길 둘
//   1) 크로미움 시작 값 --host-resolver-rules: 아래 주소를 "없는 주소"로 봄 → 모든 창에 걸림, 화면 속도·캐시는 그대로
//   2) 창(context)에 거는 가로채기(route): 광고 꾸러미만 가짜로 답하고 나머지는 끊음
//      가로채기를 켜면 그 창은 브라우저 캐시가 꺼짐(Playwright 규칙) → 꼭 필요한 창에만 검
//      - 모바일 창: 광고 꾸러미가 실패하면 한 판 끝 광고 창이 떴다 바로 사라져 "뜨면 닫기" 도우미가 헛짚음 → 가짜 꾸러미로 채움
//      - 크로미움이 아닌 창(사파리): 1)이 없어서
//      - E2E_OUTSIDE_ROUTE=all 이면 전부 (1)이 안 먹는 것으로 확인되면 global-setup이 이 값을 넣음)
// 시험이 자기 가로채기를 나중에 걸면 그쪽이 먼저 불림 (a18 guardAds·a12 blockToss 그대로 돎)
const { E2E } = require('./env');

// 가짜 광고 값 (누가 봐도 가짜, frontend-mobile/tests/a00-ads.mjs·tests/maintenance/_a18-kit.js FAKE_AD와 같은 값)
const FAKE_AD = Object.freeze({ client: 'ca-pub-0000000000000000', banner: '1111111111', interstitial: '2222222222' });
// 모바일 시험 빌드에 넣는 광고 환경값 (진짜 값이 섞이지 않게 네 칸 다 덮음)
const FAKE_AD_ENV = Object.freeze({
    VITE_AD_PROVIDER: 'adsense',
    VITE_ADSENSE_CLIENT: FAKE_AD.client,
    VITE_ADSENSE_SLOT_BANNER: FAKE_AD.banner,
    VITE_ADSENSE_SLOT_INTERSTITIAL: FAKE_AD.interstitial,
});

// 광고·분석 회사 주소 (그 주소와 아래 딸린 주소 전부)
const AD_DOMAINS = Object.freeze([
    'googlesyndication.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com', 'adtrafficquality.google',
    'google-analytics.com', 'googletagmanager.com', 'analytics.google.com',
]);
// 결제사 주소 (결제 꾸러미·결제창)
const TOSS_DOMAINS = Object.freeze(['tosspayments.com', 'toss.im']);
const BLOCKED_DOMAINS = Object.freeze([...AD_DOMAINS, ...TOSS_DOMAINS]);
// 나라마다 끝이 다른 광고 주소 (adservice.google.com·adservice.google.co.kr …)
const AD_SERVICE_HOST = /^adservice\.google\.[a-z.]+$/;

const underAny = (host, domains) => domains.some((d) => host === d || host.endsWith(`.${d}`));
const cleanHost = (hostname) => String(hostname ?? '').toLowerCase().replace(/\.$/, '');

/** 광고·분석 주소인지 → 예: isAdHost('pagead2.googlesyndication.com') // true */
const isAdHost = (hostname) => { const h = cleanHost(hostname); return underAny(h, AD_DOMAINS) || AD_SERVICE_HOST.test(h); };
/** 토스 주소인지 → 예: isTossHost('js.tosspayments.com') // true, isTossHost('nottosspayments.com') // false */
const isTossHost = (hostname) => underAny(cleanHost(hostname), TOSS_DOMAINS);
/** 기본으로 막는 주소인지 (광고·분석·토스) */
const isBlockedHost = (hostname) => isAdHost(hostname) || isTossHost(hostname);

// 가로채기에 넘기는 주소 모양 (정규식으로 넘겨야 안 걸리는 요청은 브라우저 쪽에서 바로 지나감 — 함수로 넘기면 요청마다 시험 프로세스를 거침)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCK_URL_PATTERN = new RegExp(
    `^https?://(?:[^/?#@]*@)?(?:(?:[a-z0-9-]+\\.)*(?:${BLOCKED_DOMAINS.map(escapeRe).join('|')})|adservice\\.google\\.[a-z.]+)\\.?(?::\\d+)?(?:[/?#]|$)`,
    'i',
);

// AdSense 꾸러미 주소 (화면 loadAdScript.js가 부르는 그 파일)
const isAdScript = (url) => cleanHost(url.hostname) === 'pagead2.googlesyndication.com' && url.pathname.endsWith('/adsbygoogle.js');

// 가짜 AdSense 꾸러미: 광고 칸(ins)마다 "채워짐" 표시 + 흰 바탕 시험 광고 글 (진짜 광고 요청 없음, _a18-kit.js 것과 같은 동작)
const FAKE_ADSENSE_JS = `(() => {
  const fill = () => {
    for (const ins of document.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status])')) {
      ins.setAttribute('data-adsbygoogle-status', 'done');
      ins.setAttribute('data-ad-status', 'filled');
      const box = document.createElement('div');
      box.setAttribute('data-fake-ad', '');
      box.textContent = '시험 광고';
      box.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:50px;background:#ffffff;color:#111111;font:12px sans-serif';
      ins.appendChild(box);
    }
  };
  const queued = Array.isArray(window.adsbygoogle) ? window.adsbygoogle.length : 0;
  window.adsbygoogle = { loaded: true, push: () => fill() };
  for (let i = 0; i < queued; i += 1) fill();
})();`;

// 막기 확인용 이름: 원래는 이 PC로 풀리는 이름(.localhost)인데 규칙이 먹으면 "없는 주소"가 됨 → 바깥으로 아무것도 안 나가고 확인됨
const PROBE_HOST = 'e2e-block-probe.localhost';

/**
 * 크로미움 시작 값: 막는 주소를 "없는 주소"로 보게 함
 * @example chromiumArgs() // ['--host-resolver-rules=MAP googlesyndication.com ~NOTFOUND, MAP *.googlesyndication.com ~NOTFOUND, …']
 */
function chromiumArgs() {
    const rules = [
        ...BLOCKED_DOMAINS.flatMap((d) => [`MAP ${d} ~NOTFOUND`, `MAP *.${d} ~NOTFOUND`]),
        'MAP adservice.google.* ~NOTFOUND',
        `MAP ${PROBE_HOST} ~NOTFOUND`,
    ];
    return [`--host-resolver-rules=${rules.join(', ')}`];
}

/**
 * 창 하나에 가로채기 걸기: 광고 꾸러미(adsbygoogle.js) → 가짜 꾸러미, 그 밖의 광고·분석·토스 주소 → 끊음
 * 화면을 열기 전에 걸림 (fixtures.js가 창을 만들자마자 부름) — 시험이 직접 부를 일은 없음
 * @param {import('@playwright/test').BrowserContext} context
 */
async function guardContext(context) {
    await context.route(BLOCK_URL_PATTERN, async (route) => {
        try {
            const url = new URL(route.request().url());
            if (!isBlockedHost(url.hostname)) { await route.fallback(); return; }
            if (isAdScript(url)) {
                // 화면이 crossorigin="anonymous"로 부름 → 허용 머리글이 있어야 실행됨
                await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: FAKE_ADSENSE_JS });
                return;
            }
            await route.abort();
        } catch { /* 창이 먼저 닫힘 — 시험 결과와 상관없음 */ }
    });
}

/**
 * 이 창에 가로채기가 필요한지 (브라우저 종류·창 옵션으로)
 * @param {string} browserName 'chromium' | 'webkit' | 'firefox'
 * @param {object} [options] browser.newContext에 넘긴 값 (baseURL·isMobile을 봄)
 * @param {string} [mode] E2E_OUTSIDE_ROUTE 값 ('all'이면 전부)
 * @example needsRoute('chromium', { baseURL: 'http://localhost:5274' }) // true (모바일 화면)
 * @example needsRoute('chromium', { baseURL: 'http://localhost:5273' }) // false (PC는 시작 값으로 막음)
 */
function needsRoute(browserName, options = {}, mode = process.env.E2E_OUTSIDE_ROUTE) {
    if (String(mode ?? '').toLowerCase() === 'all') return true;
    if (browserName !== 'chromium') return true;
    const base = String(options?.baseURL ?? '');
    // 관리자 화면엔 광고·결제창이 없음 (휴대폰 크기 관리자 창도 뺌)
    if (base.startsWith(E2E.adminUrl)) return false;
    return base.startsWith(E2E.mobileUrl) || options?.isMobile === true;
}

const GUARDED = Symbol.for('mmc.e2e.outsideGuard');

// 지금 도는 시험의 창 기본값 (baseURL·isMobile) — fixtures.js가 시험마다 넣고 끝나면 비움
// 기본 page·user 창은 빈 값으로 만들어지고 프로젝트 값은 Playwright 안에서 나중에 붙음 → 이 값을 같이 봐야 모바일 창을 알아봄
let contextDefaults = null;

/**
 * 이 시험의 창 기본값 알리기 (Playwright 규칙대로 시험이 안 넘긴 칸만 이 값으로 채워 봄)
 * @param {{ baseURL?:string, isMobile?:boolean }|null} defaults null이면 비움
 * @example setContextDefaults({ baseURL: 'http://localhost:5274', isMobile: true }) // 모바일 프로젝트 시험
 */
function setContextDefaults(defaults) {
    contextDefaults = defaults ? { ...defaults } : null;
}

// 창 옵션에 기본값 채우기: 넘긴 칸이 먼저 → 예: ({ baseURL: 관리자 }) + 기본 { isMobile: true } → { isMobile: true, baseURL: 관리자 }
const withDefaults = (options) => {
    const out = { ...(options ?? {}) };
    for (const [key, value] of Object.entries(contextDefaults ?? {})) {
        if (!(key in out) && value !== undefined) out[key] = value;
    }
    return out;
};

/**
 * 브라우저가 만드는 모든 창에 바깥 막기를 걸게 함 (한 브라우저에 한 번만)
 * user·page(기본 창)·players.add·시험이 직접 부른 browser.newContext·browser.newPage가 전부 이 길로 감
 * @param {import('@playwright/test').Browser} browser
 */
function guardBrowser(browser) {
    if (!browser || browser[GUARDED]) return browser;
    const original = browser.newContext.bind(browser);
    const browserName = browser.browserType().name();
    browser.newContext = async (options, ...rest) => {
        const context = await original(options, ...rest);
        if (needsRoute(browserName, withDefaults(options))) {
            try {
                await guardContext(context);
            } catch (error) {
                // 막기를 못 건 창으로 시험을 돌리지 않음 (바깥으로 나갈 수 있음)
                await context.close().catch(() => {});
                throw error;
            }
        }
        return context;
    };
    browser[GUARDED] = true;
    return browser;
}

module.exports = {
    FAKE_AD, FAKE_AD_ENV, FAKE_ADSENSE_JS, AD_DOMAINS, TOSS_DOMAINS, BLOCKED_DOMAINS, BLOCK_URL_PATTERN, PROBE_HOST,
    isAdHost, isTossHost, isBlockedHost, isAdScript, chromiumArgs, guardContext, needsRoute, guardBrowser, setContextDefaults,
};
