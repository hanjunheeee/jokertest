'use strict';

// PC 결과판이 사람 눈에 읽히는지 보는 브라우저 시험 (어려움) — 작은 창 10명 결과판, 사람 5명 각자 자기 줄에만 골드 칸, 창 크기를 바꿔도 그대로
// 목록 A07-승패-결과-골드.md 번호 A07-H-031~033, 돌리지 않고 모임만: npx playwright test --list tests/ingame/a07-result-visible.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable, readability } = require('../../helpers/visible');
const { hostGame, resultRow, closeReveals } = require('../room/roomHelpers');
const N = require('./b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const goldChip = (page) => page.getByTestId('game-result-gold-reward');
const myRow = (who) => resultRow(who.page, nick(who));
const myChip = (who) => myRow(who).getByTestId('game-result-gold-reward');

async function openHumans(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add());
    return out;
}

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

// 광대 봇이 나가 시민 승으로 판을 끝냄 (하나뿐인 광대가 나가면 바로 승패가 남)
async function endByJokerLeaving(t, jokerBot) {
    const reply = await jokerBot.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `봇 나가기 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '광대가 나가 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');
    return end;
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

test('A07-H-031 사람 2 + 봇 8 = 10명 판, 창 1280×720 → 결과판 10줄·골드 칸이 (스크롤하면) 화면 안, 안 가려짐 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(300_000);
    const people = await openHumans(players, 2);
    for (const h of people) await h.page.setViewportSize({ width: 1280, height: 720 });
    const humanRoles = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: people,
        bots: 8,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', ...humanRoles }),
    });
    expectRoles(await t.state(), { [U(t.bots[0])]: 'JOKER', ...humanRoles });
    await closeReveals(people.map((h) => h.page));
    await endByJokerLeaving(t, t.bots[0]);

    for (const h of people) {
        const list = await toResult(h.page);
        const rows = list.getByRole('listitem');
        await expect(rows).toHaveCount(10);
        for (let i = 0; i < 10; i += 1) {
            // 줄을 목록 안에서 스크롤해 보이게 한 뒤 이름이 화면 안·안 가려졌는지
            await rows.nth(i).scrollIntoViewIfNeeded();
            const seen = await readability(rows.nth(i).locator('p'), { method: 'dom' });
            expect(seen.inViewport, `${i + 1}번째 줄 이름이 화면 안`).toBe(true);
            expect(seen.covered, `${i + 1}번째 줄 이름이 안 가려짐 (가린 것: ${seen.coveredBy})`).toBe(false);
        }
        await expect(myChip(h)).toHaveText('+1골드');
        await expectReadable(myChip(h));
    }
});

test('A07-H-032 사람 5명 판 끝 → 다섯 화면 모두 골드 칸 1개, 자기 이름 줄("내 정보") 안 @game @hard', async ({ players }) => {
    test.setTimeout(420_000);
    const people = await openHumans(players, 5);
    const [j1, j2, victim] = people;
    // ㄱ 방장, ㄱ·ㄴ 광대 → 1일 밤 둘이 화면으로 같은 시민을 암살 → 광대 2 : 나머지 2 → 광대 승 (다섯 다 판 끝까지 있음)
    const roles = Object.fromEntries(people.map((h, i) => [U(h), i < 2 ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: j1, guests: people.slice(1), roles, settings: { jokers: 2 } });
    expectRoles(await t.state(), roles);
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    for (const j of [j1, j2]) await N.nightActUi(j.page, nick(victim), '암살');
    const end = await N.toEnd(t);
    expect(end?.winResult?.winner, '서버 승자').toBe('JOKER');

    for (const h of people) {
        const list = await toResult(h.page);
        await expect(list.getByRole('listitem')).toHaveCount(5);
        // 골드 칸은 화면에 하나, 그 하나가 "내 정보" 배지가 있는 내 줄 안
        await expect(goldChip(h.page)).toHaveCount(1);
        await expect(myChip(h)).toHaveText('+1골드');
        await expect(myRow(h).getByText('내 정보', { exact: true })).toHaveCount(1);
        await expect(list.getByText('내 정보', { exact: true })).toHaveCount(1);
        await expectReadable(myChip(h));
    }
});

test('A07-H-033 사람 2 + 봇 5 = 7명 판 결과판에서 창 넓이를 바꿈 → 골드 칸·직업 글이 그대로 읽힘 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const people = await openHumans(players, 2);
    const humanRoles = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: people,
        bots: 5,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', ...humanRoles }),
    });
    expectRoles(await t.state(), { [U(t.bots[0])]: 'JOKER', ...humanRoles });
    await closeReveals(people.map((h) => h.page));
    await endByJokerLeaving(t, t.bots[0]);

    for (const h of people) {
        const list = await toResult(h.page);
        // 좁게 → 넓게 → 처음 크기
        for (const size of [{ width: 1024, height: 768 }, { width: 1600, height: 900 }, { width: 1280, height: 800 }]) {
            await h.page.setViewportSize(size);
            await expect(list.getByRole('listitem'), `${size.width}×${size.height} 줄 수`).toHaveCount(7);
            await expect(myChip(h)).toHaveText('+1골드');
            await expectReadable(myChip(h));
            // 내 직업 글 (시민 직업은 "귀족" — 결정 2026-11-16 셋째 8번)
            await expectReadable(myRow(h).getByText('귀족', { exact: true }));
        }
    }
});
