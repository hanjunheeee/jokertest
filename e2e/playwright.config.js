// 브라우저 시험 설정 파일, 시험 전용 백엔드(4100)·데스크톱(5273)·모바일(5274)을 띄우고 프로젝트 셋(desktop·mobile·serial)으로 돌림
// npx playwright test (e2e 폴더) — 개발 서버(4000·5173·5174)·개발 DB와 안 겹침, 자세한 건 README.md
const path = require('node:path');
const crypto = require('node:crypto');
const { defineConfig, devices } = require('@playwright/test');
const { E2E } = require('./helpers/env');

// 실행 번호: 이 실행에서 만든 계정 이메일에 붙음 (끝나면 이 번호 것만 지움), 작업자도 같은 값을 물려받음
if (!process.env.E2E_RUN_ID) process.env.E2E_RUN_ID = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;

const reuse = process.env.E2E_REUSE === '1';
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
    outputDir: 'test-results',
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
            testIgnore: ['mobile/**'],
            grepInvert: /@serial|@shutdown/,
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: E2E.desktopUrl },
        },
        {
            name: 'mobile',
            testMatch: ['mobile/**/*.spec.js'],
            grepInvert: /@serial|@shutdown/,
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
            // 서버 전체에 걸리는 시험 (서버 꺼짐·점검·전체 공지) — 다른 시험이 다 끝난 뒤 한 개씩
            name: 'serial',
            grep: /@serial|@shutdown/,
            workers: 1,
            fullyParallel: false,
            dependencies: ['desktop', 'mobile'],
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: E2E.desktopUrl },
        },
    ],
    webServer: [
        {
            name: 'backend',
            command: 'node scripts/start-backend.js',
            url: `${E2E.apiUrl}/health`,
            reuseExistingServer: reuse,
            timeout: 120_000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            name: 'desktop',
            command: 'node node_modules/vite/bin/vite.js --config ../e2e/vite/desktop.config.mjs',
            cwd: path.join(__dirname, '..', 'frontend'),
            url: E2E.desktopUrl,
            env: { VITE_API_BASE_URL: E2E.apiUrl },
            reuseExistingServer: reuse,
            timeout: 120_000,
        },
        {
            name: 'mobile',
            command: 'node node_modules/vite/bin/vite.js --config ../e2e/vite/mobile.config.mjs',
            cwd: path.join(__dirname, '..', 'frontend-mobile'),
            url: E2E.mobileUrl,
            env: { VITE_API_BASE_URL: E2E.apiUrl },
            reuseExistingServer: reuse,
            timeout: 120_000,
        },
    ],
});
