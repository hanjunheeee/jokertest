'use strict';

// 모바일 결과판 브라우저 시험 — 판 끝에 전원 이름·직업 공개, 마녀사냥꾼 이름, MVP 없음, 승패 띠·이긴 진영 띠, 10명 결과판 스크롤, 새로고침
// 목록 A07-승패-결과-골드.md 번호 A07-E-069~076·084~089 (판은 봇이 나가는 길로 빨리 끝냄), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a07-result-board.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable, readability } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { resultRow } = require('../room/roomHelpers');
const { startTalkGame } = require('./_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

// 결과판 직업 글 (PC와 같은 글 gameResultLabels.js) — 시민 직업은 "귀족"(결정 2026-11-16 셋째 8번), 의사는 "의사"(결정 2026-11-16 아침 19번, "주치의" 안 씀)
const RESULT_JOB = Object.freeze({ JOKER: '광대', CITIZEN: '귀족', DOCTOR: '의사', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' });

// 서버가 정한 직업이 바라는 대로인지 (예약이 가끔 못 맞음 → 판이 다른 쪽으로 끝나는 것 막기)
function expectRoles(s, wanted) {
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
}

// 판 요약이 조건에 맞을 때까지 (단계는 안 넘김)
async function waitState(t, match, message, timeout = 20_000) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last ? match(last) : false; }, { timeout, message }).toBe(true);
    return last;
}

// 봇이 판에서 나가기 (산 채로 나가면 죽은 것으로 바뀌고 바로 승패 확인)
async function botLeave(t, bot) {
    const reply = await bot.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `봇 나가기 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
}

// 영상 연출 셋 (암살 영상·추방 연출·결과 영상) — "건너뛰기"는 이 안에서만 찾음 (밤 차례의 "건너뛰기" 단추와 안 섞이게)
const VIDEO_COVERS = '[data-ingame-night-success-kill], [data-ingame-tribunal-expulsion], [data-game-result-intro]';

// 화면을 막는 연출 넘기기: 영상이 못 돌 때 뜨는 "건너뛰기", 낮 시작 연출 글 창 "확인"
async function passCovers(page) {
    const skip = page.locator(VIDEO_COVERS).getByRole('button', { name: '건너뛰기' }).first();
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
    const dawnOk = page.locator('[data-ingame-dawn-report]').getByRole('button', { name: '확인' });
    if (await dawnOk.count() > 0) await dawnOk.first().click({ timeout: 1000 }).catch(() => {});
}

// 결과판이 보일 때까지: 가는 길을 막는 연출만 넘김
async function toResult(page, { timeout = 60_000 } = {}) {
    const list = resultBoard(page);
    await expect(async () => {
        await passCovers(page);
        await expect(list).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    await expect(page).toHaveURL(/\/gameresult/);
    return list;
}

// 판 끝 광고 창(결과가 다 나타나고 1.5초 뒤, 5초 뒤 "닫기")은 결과판을 덮음 → 보임 확인·단추 누르기 전에 닫음 (광고가 꺼진 빌드면 그냥 지나감)
async function closeAd(page) {
    const ad = page.getByRole('dialog', { name: '광고' });
    const shown = await ad.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
    if (!shown) return;
    // 광고 꾸러미를 못 받으면 "닫기" 전에 창이 스스로 닫힘 → 닫기 단추가 나오거나 창이 사라지거나 둘 중 하나까지
    const close = ad.getByRole('button', { name: '닫기' });
    await expect(async () => {
        if (await close.isVisible().catch(() => false)) await close.click({ timeout: 2000 });
        await expect(ad).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
}

// n명 판(광대 1, 자동 구성)에서 광대 봇이 나가 시민 승 — 사람은 이긴 편 산 시민 → { t, end, list } (광고까지 닫음)
async function citizenWinBoard(table, user, n, extraRoles = () => ({})) {
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: n - 1,
        settings: PACE,
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', ...extraRoles(bots) }),
    });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER', ...extraRoles(t.bots) });
    await botLeave(t, t.bots[0]);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '광대가 나가 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');
    const list = await toResult(user.page);
    await closeAd(user.page);
    return { t, end, list };
}

// n명 판(광대 봇 2, 나머지 시민)에서 시민 봇이 나가 광대 2 : 나머지 2 → 광대 승 — 사람은 진 편 산 시민 → { t, end, list }
async function jokerWinBoard(table, user, n) {
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: n - 1,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER' }),
    });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER', [U(t.bots[1])]: 'JOKER' });
    // 시민 봇 n-4명이 나가면 남는 건 나 + 시민 봇 1 (예: 6명 판 → 봇 2·3이 나감)
    for (const bot of t.bots.slice(2, n - 2)) await botLeave(t, bot);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '수가 같아져 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');
    const list = await toResult(user.page);
    await closeAd(user.page);
    return { t, end, list };
}

// ── 전원 이름·직업 (A07-E-069~073) ──

const SIZE_CASES = [['A07-E-069', 5], ['A07-E-070', 6], ['A07-E-071', 7], ['A07-E-072', 8], ['A07-E-073', 10]];

for (const [no, n] of SIZE_CASES) {
    const tags = no === 'A07-E-069' ? '@game @smoke' : '@game';
    test(`${no} 모바일 ${n}명 판 끝 → 결과판 줄 ${n}개, 줄마다 그 사람 직업 글 ${tags}`, async ({ user, table }) => {
        const page = user.page;
        const { end, list } = await citizenWinBoard(table, user, n);
        // 산 채로 나간 광대 봇도 목록에 있음
        await expect(list.getByRole('listitem')).toHaveCount(n);
        expect(end.players).toHaveLength(n);
        for (const p of end.players) {
            await expect(resultRow(page, p.nickname), `${p.nickname} 줄`).toHaveCount(1);
            await expect(resultRow(page, p.nickname).getByText(RESULT_JOB[p.role], { exact: true }), `${p.nickname} 직업 ${p.role}`).toHaveCount(1);
        }
    });
}

test('A07-E-074 모바일 10명 판 결과판 마녀사냥꾼 줄 → "마녀사냥꾼" ("시민"·"귀족" 아님) @game', async ({ user, table }) => {
    const page = user.page;
    const { t } = await citizenWinBoard(table, user, 10, (bots) => ({ [U(bots[1])]: 'WITCH_HUNTER' }));
    const row = resultRow(page, t.bots[1].account.nickname);
    await expectReadable(row.getByText('마녀사냥꾼', { exact: true }));
    // 시민 이름으로 잘못 나오면 안 됨 (시민 직업 글은 "귀족", 예전 글은 "시민" — 둘 다 없어야 함)
    await expect(row.getByText('시민', { exact: true })).toHaveCount(0);
    await expect(row.getByText('귀족', { exact: true })).toHaveCount(0);
});

// ── MVP 없음 (A07-E-075~076) ──

const MVP_CASES = [
    ['A07-E-075', '이긴 편', 5, citizenWinBoard],
    ['A07-E-076', '진 편', 6, jokerWinBoard],
];

for (const [no, side, n, play] of MVP_CASES) {
    test(`${no} 모바일 ${n}명 판 ${side} 결과판 → "MVP" 글·칸 없음 @game`, async ({ user, table }) => {
        const page = user.page;
        const { list } = await play(table, user, n);
        // 결과판은 다 그려진 채로 (줄 수) MVP만 없음
        await expect(list.getByRole('listitem')).toHaveCount(n);
        await expect(page.getByText(/MVP/i)).toHaveCount(0);
        await expect(page.getByRole('complementary', { name: /MVP/i })).toHaveCount(0);
    });
}

// ── 승패 띠 (A07-E-084~085) ──

const BANNER_CASES = [
    ['A07-E-084', '이김', '승리', 5, citizenWinBoard],
    ['A07-E-085', '짐', '패배', 6, jokerWinBoard],
];

for (const [no, side, label, n, play] of BANNER_CASES) {
    test(`${no} 모바일 ${n}명 판 내 편이 ${side} → 맨 위 띠 "${label}" @game`, async ({ user, table }) => {
        const page = user.page;
        await play(table, user, n);
        await expectReadable(page.getByText(label, { exact: true }), { large: true });
        await expect(page.getByText(label === '승리' ? '패배' : '승리', { exact: true })).toHaveCount(0);
    });
}

// ── 이긴 진영 띠 (A07-E-086~087) ──

const TEAM_CASES = [
    ['A07-E-086', '시민 승', '시민 진영 승리', '광대 진영 승리', 7, citizenWinBoard],
    ['A07-E-087', '광대 승', '광대 진영 승리', '시민 진영 승리', 8, jokerWinBoard],
];

for (const [no, side, label, other, n, play] of TEAM_CASES) {
    test(`${no} 모바일 ${n}명 판 ${side} → 진영 띠 "${label}" @game`, async ({ user, table }) => {
        const { list } = await play(table, user, n);
        await expectReadable(list.getByText(label, { exact: true }));
        await expect(list.getByText(other, { exact: true })).toHaveCount(0);
    });
}

// ── 10명 결과판·새로고침 ──

test('A07-E-088 모바일 10명 결과판 → 스크롤하면 10줄 모두 화면 안, 마지막 줄 읽힘 @game @safari', async ({ user, table }) => {
    const { list } = await citizenWinBoard(table, user, 10);
    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(10);
    for (let i = 0; i < 10; i += 1) {
        // 줄을 화면 가운데로 스크롤 → 화면 안·아래 단추 줄에 안 가려짐 (끝까지 내려도 가려지면 그 줄은 못 봄)
        await rows.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
        const seen = await readability(rows.nth(i).locator('p'), { method: 'dom' });
        expect(seen.inViewport, `${i + 1}번째 줄 이름이 화면 안`).toBe(true);
        expect(seen.covered, `${i + 1}번째 줄 이름이 안 가려짐 (가린 것: ${seen.coveredBy})`).toBe(false);
    }
    await expectReadable(rows.nth(9).locator('p'));
});

test('A07-E-089 모바일 5명 판 결과 화면에서 새로고침 → "게임 결과를 확인할 수 없습니다" @game', async ({ user, table }) => {
    const page = user.page;
    await citizenWinBoard(table, user, 5);
    await page.reload();
    await expectReadable(page.getByText('게임 결과를 확인할 수 없습니다', { exact: true }), { timeout: 20_000 });
    await expectReadable(page.getByRole('button', { name: '로비로 돌아가기' }));
    await expect(resultBoard(page)).toHaveCount(0);
});
