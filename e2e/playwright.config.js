// 브라우저 시험 설정 파일, 시험 전용 백엔드(4100)·데스크톱(5273)·모바일(5274)을 띄우고 프로젝트 셋(desktop·mobile·serial)으로 돌림
// npx playwright test (e2e 폴더) — 개발 서버(4000·5173·5174)·개발 DB와 안 겹침, 자세한 건 README.md
// Node 여러 개: E2E_NODES=2 [E2E_LB=rr|least] [E2E_PROXY=node|nginx] [E2E_REDIS_URL=…] npx playwright test
//   → 4100 앞단 뒤에 Node 둘(4101·4102)·시험 Redis, tests/multinode/** 도 돌고 @single-node(한 서버라야 뜻 있는 시험)는 뺌
//   E2E_NODES=1(기본)이면 예전과 똑같음 (multinode 폴더는 안 돎)
const path = require('node:path');
const crypto = require('node:crypto');
const { defineConfig, devices } = require('@playwright/test');
const { E2E } = require('./helpers/env');

// 실행 번호: 이 실행에서 만든 계정 이메일에 붙음 (끝나면 이 번호 것만 지움), 작업자도 같은 값을 물려받음
if (!process.env.E2E_RUN_ID) process.env.E2E_RUN_ID = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;

const reuse = process.env.E2E_REUSE === '1';
// 화면 서버: build(기본, 빌드본 + 작은 정적 서버 — CPU 적게) 또는 dev(vite 개발 서버), scripts/serve-front.js
const frontMode = (process.env.E2E_FRONT || 'build').toLowerCase();
// 빌드는 처음 한 번 1~3분 걸려서 넉넉히
const frontTimeout = frontMode === 'dev' ? 120_000 : 420_000;

// Node 여러 개일 때만 바뀌는 칸 (1개면 아래 값이 전부 예전 그대로)
const multi = E2E.multiNode;
// 한 서버 가정 시험 빼기 / 1개일 땐 multinode 폴더를 안 돌림
const withSingleNode = (re) => (multi ? new RegExp(`${re.source}|@single-node`) : re);
const desktopIgnore = multi ? ['mobile/**', 'multinode/mobile/**'] : ['mobile/**', 'multinode/**'];
const mobileMatch = multi ? ['mobile/**/*.spec.js', 'multinode/mobile/**/*.spec.js'] : ['mobile/**/*.spec.js'];
const serialIgnore = multi ? [] : ['multinode/**'];
// 글 모양 'mobile/**'는 아무 깊이에서나 맞음 → 1개일 땐 multinode/mobile도 따로 빼야 함
const mobileIgnore = multi ? [] : ['multinode/**'];
module.exports = defineConfig({
    testDir: './tests',
    // 판 시험은 한 판에 1~3분 → 넉넉히, 기대 기다림도 길게
    timeout: 120_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    // 안전한 동시 수 (README '병렬' 참고): 기본 6, 8까지 확인, E2E_WORKERS로 바꿈
    workers: Number(process.env.E2E_WORKERS || 6),
    retries: 1,
    forbidOnly: !!process.env.CI,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'reports/html', open: 'never' }],
        ['json', { outputFile: 'reports/results.json' }],
    ],
    // 실패 사진·trace: 실행마다 따로 (여럿이 같이 돌려도 서로 안 지움), E2E_OUTPUT_DIR로 바꿈
    outputDir: process.env.E2E_OUTPUT_DIR || path.join('test-results', process.env.E2E_RUN_ID),
    globalSetup: require.resolve('./helpers/global-setup.js'),
    globalTeardown: require.resolve('./helpers/global-teardown.js'),
    use: {
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off',
    },
    projects: [
        {
            name: 'desktop',
            testIgnore: desktopIgnore,
            grepInvert: withSingleNode(/@serial|@shutdown/),
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: E2E.desktopUrl },
        },
        {
            name: 'mobile',
            testMatch: mobileMatch,
            testIgnore: mobileIgnore,
            grepInvert: withSingleNode(/@serial|@shutdown/),
            use: {
                ...devices['Pixel 7'],
                // 세로 375×812 + 터치 (카톡형 인게임 기준 크기)
                viewport: { width: 375, height: 812 },
                isMobile: true,
                hasTouch: true,
                baseURL: E2E.mobileUrl,
            },
        },
        {
            // 아이폰 사파리 (WebKit) — 모바일 시험을 그대로 한 번 더, 사파리에서만 다른 동작 잡기
            name: 'mobile-safari',
            testMatch: mobileMatch,
            testIgnore: mobileIgnore,
            grepInvert: withSingleNode(/@serial|@shutdown/),
            use: {
                ...devices['iPhone 13'],
                viewport: { width: 375, height: 812 },
                isMobile: true,
                hasTouch: true,
                baseURL: E2E.mobileUrl,
            },
        },
        {
            // 서버 전체에 걸리는 시험 (서버 꺼짐·점검·전체 공지) — 다른 시험이 다 끝난 뒤 한 개씩
            name: 'serial',
            grep: /@serial|@shutdown/,
            ...(multi ? { grepInvert: /@single-node/ } : {}),
            testIgnore: serialIgnore,
            workers: 1,
            fullyParallel: false,
            dependencies: ['desktop', 'mobile', 'mobile-safari'],
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: E2E.desktopUrl },
        },
    ],
    webServer: [
        {
            name: 'backend',
            command: 'node scripts/start-backend.js',
            url: `${E2E.apiUrl}/health`,
            reuseExistingServer: reuse,
            // Node 여러 개는 Redis·Node 둘·앞단까지 켜서 넉넉히, 끌 때 SIGTERM으로 앞단(docker nginx)도 치우게
            timeout: multi ? 240_000 : 120_000,
            ...(multi ? { gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 } } : {}),
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            name: 'desktop',
            command: 'node scripts/serve-front.js desktop',
            url: E2E.desktopUrl,
            env: { VITE_API_BASE_URL: E2E.apiUrl, E2E_FRONT: frontMode },
            reuseExistingServer: reuse,
            timeout: frontTimeout,
            stdout: 'pipe',
        },
        {
            name: 'mobile',
            command: 'node scripts/serve-front.js mobile',
            url: E2E.mobileUrl,
            env: { VITE_API_BASE_URL: E2E.apiUrl, E2E_FRONT: frontMode },
            reuseExistingServer: reuse,
            timeout: frontTimeout,
            stdout: 'pipe',
        },
    ],
});
