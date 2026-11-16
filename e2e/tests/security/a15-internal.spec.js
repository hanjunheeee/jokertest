'use strict';

// 안쪽 전용 경로·시험 손잡이 브라우저 시험 — 운영 값으로 따로 띄운 서버엔 /e2e 손잡이가 아예 없음(맞는 열쇠여도 404), 시험 서버 손잡이·/internal은 열쇠 없거나 틀리면 401
// 목록 A15-보안.md 번호 A15-E-051~058 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-internal.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { api, startSec, PRODUCTION, readSecrets } = require('./_sec');

// 이 파일의 따로 띄운 서버 (보안 전용 포트 2번)
const SEC_SLOT = 2;
// 누가 봐도 가짜인 틀린 열쇠 (길이만 맞춤)
const WRONG_KEY = `a15-wrong-key-not-real-${'z'.repeat(24)}`;
const goodKey = () => ({ 'x-internal-key': readSecrets().INTERNAL_API_KEY });

// [번호, 방법, 경로] — 운영 값 서버에 맞는 열쇠로
const HOOKS = [
    ['A15-E-051', 'POST', '/e2e/role-presets', { presets: {} }],
    ['A15-E-052', 'GET', '/e2e/users/x/game', undefined],
    ['A15-E-053', 'POST', '/e2e/games/x/advance', undefined],
    ['A15-E-054', 'POST', '/e2e/games/x/expire-graces', undefined],
    ['A15-E-055', 'POST', '/e2e/games/x/close-results', undefined],
];

test.describe('A15 운영 값 서버엔 시험 손잡이 없음', () => {
    // 운영 값 서버 하나를 이 묶음이 한 작업자에서 차례로 같이 씀
    test.describe.configure({ mode: 'default' });
    let prod = null;
    test.beforeAll(async () => {
        test.setTimeout(330_000);
        prod = await startSec(SEC_SLOT, { overrides: PRODUCTION });
    });
    test.afterAll(async () => { await prod?.stop(); });

    for (const [id, method, path, body] of HOOKS) {
        const smoke = id === 'A15-E-051' ? ' @smoke' : '';
        test(`${id} 운영 값 서버(시험 전용 값 없음)에 맞는 열쇠로 ${method} ${path} → 404${smoke}`, async () => {
            // 서버가 살아 있는지 먼저 (404가 꺼진 서버 탓이 아니게)
            expect((await api('GET', '/health', { base: prod.url })).status).toBe(200);
            const r = await api(method, path, { base: prod.url, headers: goodKey(), body });
            expect(r.status).toBe(404);
        });
    }
});

test('A15-E-056 시험 서버 손잡이도 열쇠 없이 GET /e2e/users/x/room → 401', async () => {
    const r = await api('GET', '/e2e/users/x/room');
    expect(r.status).toBe(401);
});

test('A15-E-057 시험 서버 GET /internal/live 열쇠 없이 → 401 INTERNAL_UNAUTHORIZED', async () => {
    const r = await api('GET', '/internal/live');
    expect(r.status).toBe(401);
    expect(r.json?.code).toBe('INTERNAL_UNAUTHORIZED');
});

test('A15-E-058 시험 서버 GET /internal/live 틀린 열쇠 → 401 INTERNAL_UNAUTHORIZED', async () => {
    const r = await api('GET', '/internal/live', { headers: { 'x-internal-key': WRONG_KEY } });
    expect(r.status).toBe(401);
    expect(r.json?.code).toBe('INTERNAL_UNAUTHORIZED');
});
