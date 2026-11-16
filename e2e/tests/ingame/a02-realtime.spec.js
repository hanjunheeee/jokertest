'use strict';

// 역할 확인 10초 브라우저 시험 (PC) — 손잡이 없이 진짜로 기다려 10초 전엔 낮이 아니고, 확인을 눌러도 안 당겨지고, 10초(±1.5초)에 첫 낮
// 목록 A02-판시작-역할.md 번호 A02-E-083~088 — 전부 @realtime (시각은 방장 봇이 game_started를 받은 때부터 잼)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const night = require('./b-night/_night');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const dayNotice = (page) => page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: '낮이 되었습니다' });
const REVEAL_MS = 10_000;
// 진짜 시간 허용 폭 ±1.5초 (시험_계획.md 3-5, 더 늘려 덮지 않음)
const SLACK_MS = 1500;

// 자동 구성대로 직업 고정, 사람은 시민 (결정 "구성 칸": 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼)
function autoBotRoles(n) {
    const special = ['JOKER', ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
    return [...special, ...Array(n - 1 - special.length).fill('CITIZEN')];
}

async function openTable(table, user, n) {
    return night.setup(table, { humans: [user], bots: n - 1, humanRoles: ['CITIZEN'], botRoles: autoBotRoles(n) });
}

// 판이 시작된 시각 (방장 봇이 game_started를 받은 때)
function startedAtOf(t) {
    const row = t.bots[0].events.find((r) => r.event === 'game_started');
    if (!row) throw new Error('방장 봇이 game_started를 못 받음');
    return row.at;
}

// 그 시각까지 진짜로 기다림 (진짜 시간 규칙 확인이라 쉬기 씀)
async function sleepUntil(at) {
    const wait = at - Date.now();
    if (wait > 0) await sleep(wait);
}

// 조건이 참이 된 시각 (0.1초마다 봄)
async function timeWhen(check, { timeout = 20_000, message } = {}) {
    let at = null;
    await expect.poll(async () => {
        if (await check()) { at = Date.now(); return true; }
        return false;
    }, { timeout, intervals: [100], message }).toBe(true);
    return at;
}

// 시작부터 걸린 시간이 10초 ±1.5초 안
function expectAboutTenSeconds(at, startedAt) {
    const elapsed = at - startedAt;
    expect(elapsed, `시작부터 ${elapsed}ms`).toBeGreaterThanOrEqual(REVEAL_MS - SLACK_MS);
    expect(elapsed, `시작부터 ${elapsed}ms`).toBeLessThanOrEqual(REVEAL_MS + SLACK_MS);
}

// 서버도 첫 낮(1일째)인지
async function expectServerFirstDay(t) {
    await expect.poll(async () => {
        const s = await t.state();
        return `${s?.phase}:${s?.dayIndex}`;
    }, { timeout: 5_000 }).toBe('DAY:1');
}

test('A02-E-083 5명, 시작 뒤 9초 → 역할 창 그대로, "낮이 되었습니다" 없음 @game @realtime @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 5);
    const startedAt = startedAtOf(t);
    await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
    await sleepUntil(startedAt + 9_000);
    expect(await revealDialog(page).isVisible(), '9초에 역할 창').toBe(true);
    expect(await dayNotice(page).isVisible(), '9초에 낮 안내').toBe(false);
    expect((await t.state()).phase).toBe('ROLE_REVEAL');
    // 위 확인이 10초 전에 끝났어야 뜻이 있음
    expect(Date.now() - startedAt).toBeLessThan(REVEAL_MS);
});

test('A02-E-084 5명 → 10초(±1.5초)에 "낮이 되었습니다", 1일째 @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 5);
    const startedAt = startedAtOf(t);
    const dayAt = await timeWhen(() => dayNotice(page).isVisible(), { message: '낮 안내가 안 뜸' });
    expectAboutTenSeconds(dayAt, startedAt);
    await expectReadable(dayNotice(page).getByText('낮이 되었습니다', { exact: true }));
    await expectServerFirstDay(t);
});

test('A02-E-085 6명, 1초에 확인 → 창 닫힘, 9초까지 낮 아님, 10초(±1.5초)에 낮 @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 6);
    const startedAt = startedAtOf(t);
    const dialog = revealDialog(page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await sleepUntil(startedAt + 1_000);
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toBeHidden();
    await sleepUntil(startedAt + 9_000);
    expect(await dayNotice(page).isVisible(), '9초에 낮 안내').toBe(false);
    expect((await t.state()).phase).toBe('ROLE_REVEAL');
    expect(Date.now() - startedAt).toBeLessThan(REVEAL_MS);
    const dayAt = await timeWhen(() => dayNotice(page).isVisible(), { message: '낮 안내가 안 뜸' });
    expectAboutTenSeconds(dayAt, startedAt);
    await expectServerFirstDay(t);
});

test('A02-E-086 7명, 아무것도 안 누름 → 10초(±1.5초)에 역할 창 없음·낮 @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, 7);
    const startedAt = startedAtOf(t);
    await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
    const at = await timeWhen(
        async () => !(await revealDialog(page).isVisible()) && (await dayNotice(page).isVisible()),
        { message: '역할 창이 안 닫히거나 낮 안내가 안 뜸' },
    );
    expectAboutTenSeconds(at, startedAt);
    await expectServerFirstDay(t);
});

for (const [no, n] of [[87, 8], [88, 10]]) {
    test(`A02-E-0${no} ${n}명 판 → 10초(±1.5초)에 낮 @game @realtime`, async ({ user, table }) => {
        const page = user.page;
        const t = await openTable(table, user, n);
        const startedAt = startedAtOf(t);
        const dayAt = await timeWhen(() => dayNotice(page).isVisible(), { message: '낮 안내가 안 뜸' });
        expectAboutTenSeconds(dayAt, startedAt);
        await expectServerFirstDay(t);
    });
}
