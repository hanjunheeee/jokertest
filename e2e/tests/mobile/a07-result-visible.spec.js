'use strict';

// 모바일 결과판이 사람 눈에 읽히는지 보는 브라우저 시험 (어려움) — 모바일 사람 여럿의 화면마다 골드·직업·띠, 사파리에서도 "+1골드"·"마녀사냥꾼"·MVP 없음
// 목록 A07-승패-결과-골드.md 번호 A07-H-029~030 (030은 사파리에서도 돎), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a07-result-visible.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { resultRow, closeReveals } = require('../room/roomHelpers');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');

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

// 판 끝 광고 창(결과가 다 나타나고 1.5초 뒤, 5초 뒤 "닫기")은 결과판을 덮음 → 보임 확인 전에 닫음 (광고가 꺼진 빌드면 그냥 지나감)
async function closeAd(page) {
    const ad = page.getByRole('dialog', { name: '광고' });
    const shown = await ad.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
    if (!shown) return;
    await ad.getByRole('button', { name: '닫기' }).click({ timeout: 10_000 });
    await expect(ad).toHaveCount(0);
}

test('A07-H-029 모바일 사람 3 + 봇 7 = 10명 판 끝 → 세 화면 모두 골드 칸·직업 글·승패 띠·진영 띠가 읽힘 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(360_000);
    const phones = [user, await players.add({ mobile: true }), await players.add({ mobile: true })];
    const humanRoles = Object.fromEntries(phones.map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: phones,
        bots: 7,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'WITCH_HUNTER', ...humanRoles }),
    });
    const [jokerBot, hunterBot] = t.bots;
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(hunterBot)]: 'WITCH_HUNTER', ...humanRoles });
    await closeReveals(phones.map((h) => h.page));
    await endByJokerLeaving(t, jokerBot);

    for (const h of phones) {
        const list = await toResult(h.page);
        await closeAd(h.page);
        await expect(list.getByRole('listitem')).toHaveCount(10);
        // 띠: 맨 위 승패 + 이긴 진영
        await expectReadable(h.page.getByText('승리', { exact: true }), { large: true });
        await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
        // 내 줄: 골드 칸 + 직업 글 (시민은 "귀족")
        await expect(myChip(h)).toHaveText('+1골드');
        await expectReadable(myChip(h));
        await expectReadable(resultRow(h.page, nick(h)).getByText('귀족', { exact: true }));
        // 남의 줄 직업 글도 (스크롤해서) 읽힘
        await expectReadable(resultRow(h.page, nick(hunterBot)).getByText('마녀사냥꾼', { exact: true }));
        await expectReadable(resultRow(h.page, nick(jokerBot)).getByText('광대', { exact: true }));
    }
});

test('A07-H-030 모바일 사람 2 + 봇 4 = 6명 판 끝 (사파리에서도) → "+1골드" 읽힘, 마녀사냥꾼 줄 "마녀사냥꾼", "MVP" 없음 @game @hard @safari', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    // 첫 사람은 이 프로젝트 기기 그대로 (사파리 프로젝트면 아이폰 사파리)
    const phones = [user, await players.add({ mobile: true })];
    const humanRoles = Object.fromEntries(phones.map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: phones,
        bots: 4,
        settings: customRoleSettings({ JOKER: 1, WITCH_HUNTER: 1 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'WITCH_HUNTER', ...humanRoles }),
    });
    const [jokerBot, hunterBot] = t.bots;
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(hunterBot)]: 'WITCH_HUNTER', ...humanRoles });
    await closeReveals(phones.map((h) => h.page));
    await endByJokerLeaving(t, jokerBot);

    for (const h of phones) {
        const list = await toResult(h.page);
        await closeAd(h.page);
        await expect(list.getByRole('listitem')).toHaveCount(6);
        await expect(myChip(h)).toHaveText('+1골드');
        await expectReadable(myChip(h));
        const hunterRow = resultRow(h.page, nick(hunterBot));
        await expectReadable(hunterRow.getByText('마녀사냥꾼', { exact: true }));
        await expect(hunterRow.getByText('귀족', { exact: true })).toHaveCount(0);
        await expect(h.page.getByText(/MVP/i)).toHaveCount(0);
    }
});
