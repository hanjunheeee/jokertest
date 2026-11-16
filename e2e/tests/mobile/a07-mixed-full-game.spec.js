'use strict';

// PC 사람과 모바일 사람이 섞인 판을 처음부터 끝까지 하는 브라우저 시험 (어려움) — 각자 자기 화면으로 낮 투표·재판을 하고, 두 화면 종류 모두 같은 승자·직업·"+1골드"를 봄
// 목록 A07-승패-결과-골드.md 번호 A07-H-005 (모바일 프로젝트에서 PC 창 3개를 따로 엶), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a07-mixed-full-game.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { closeOverlays } = require('../../helpers/ui');
const { resultRow, closeReveals } = require('../room/roomHelpers');
const { talk } = require('./_talk');
const N = require('../ingame/b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');

// 결과판 직업 글 (판 화면과 같은 이름: 시민 직업은 "귀족" — 결정 2026-11-16 셋째 8번)
const RESULT_JOB = Object.freeze({ JOKER: '광대', CITIZEN: '귀족' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

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

// 봇 요청 하나 보내고 서버가 받았는지 확인
async function botDo(bot, event, payload, what) {
    const reply = await bot.request(event, payload);
    expect(reply?.ok, `${what} 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
    return reply;
}

// PC 사람 낮 표: 그 사람 카드 메뉴 "투표하기" → 기권 단추가 꺼지면 서버가 받은 것 (막는 안내 창은 카드 메뉴 열기가 닫음)
async function votePcUi(page, nickname) {
    const menu = await N.openCardMenu(page, nickname);
    await menu.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: '기권' })).toBeDisabled();
}

// 모바일 사람 낮 표: 초상 띠에서 그 사람 칸 → 아래 시트 "투표하기" → 기권 단추가 꺼지면 서버가 받은 것
async function votePhoneUi(page, nickname) {
    const sheet = page.locator('[data-ingame-player-card-menu]');
    await expect(async () => {
        await closeOverlays(page, { keepWatching: false, rounds: 2, clickTimeoutMs: 1000 });
        await talk.slot(page, nickname).click({ timeout: 1500 });
        await expect(sheet).toHaveAttribute('aria-label', nickname, { timeout: 1500 });
    }).toPass({ timeout: 25_000 });
    await sheet.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: '기권' }).first()).toBeDisabled();
}

// 재판 유죄 (PC·모바일 같은 표시·같은 단추 이름): 재판 창 "유죄" → 단추가 사라지면 서버가 받은 것
async function guiltyUi(page) {
    const guilty = page.locator('[data-ingame-tribunal-presentation]').getByRole('button', { name: '유죄', exact: true });
    await expect(async () => {
        await closeOverlays(page, { keepWatching: false, rounds: 1, names: ['단계 전환 안내', '알림'], clickTimeoutMs: 1000 });
        await guilty.click({ timeout: 1500 });
    }).toPass({ timeout: 25_000 });
    await expect(guilty).toHaveCount(0);
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

// 모바일 판 끝 광고 창(결과가 다 나타나고 1.5초 뒤, 5초 뒤 "닫기")은 결과판을 덮음 → 보임 확인 전에 닫음 (광고가 꺼진 빌드면 그냥 지나감)
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

test('A07-H-005 PC 사람 3 + 모바일 사람 2 + 봇 2 = 7명 판 처음부터 끝까지 → PC·모바일 화면 모두 "시민 진영 승리"·같은 직업·내 줄 "+1골드" @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(480_000);
    const pcs = [];
    for (let i = 0; i < 3; i += 1) pcs.push(await players.add({ mobile: false }));
    const phones = [];
    for (let i = 0; i < 2; i += 1) phones.push(await players.add({ mobile: true }));
    const people = [...pcs, ...phones];
    const humanRoles = Object.fromEntries(people.map((h) => [U(h), 'CITIZEN']));

    const t = await table.setup({
        humans: people,
        bots: 2,
        settings: customRoleSettings({ JOKER: 1 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'CITIZEN', ...humanRoles }),
    });
    const [jokerBot, citizenBot] = t.bots;
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(citizenBot)]: 'CITIZEN', ...humanRoles });

    // 역할 창 닫고 1일 낮 투표까지 (토론은 손잡이로 넘김)
    await closeReveals(people.map((h) => h.page));
    await t.advanceUntil('DAY_VOTE');
    for (const h of people) await expect(h.page.getByRole('button', { name: '기권' }).first()).toBeVisible({ timeout: 15_000 });

    // 낮 투표: 사람 다섯은 각자 화면으로, 시민 봇은 소켓으로 광대 봇을 찍고 광대 봇은 기권 → 일곱 다 내서 5초 뒤 재판
    for (const h of pcs) await votePcUi(h.page, nick(jokerBot));
    for (const h of phones) await votePhoneUi(h.page, nick(jokerBot));
    await botDo(citizenBot, 'cast_day_vote', { gameId: t.gameId, targetId: U(jokerBot) }, '봇 낮 표');
    await botDo(jokerBot, 'cast_day_vote', { gameId: t.gameId, targetId: null }, '봇 기권');
    const tribunal = await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === U(jokerBot), '다 낸 뒤 재판', 30_000);

    // 재판: 사람 다섯·시민 봇 유죄 → 다 내서 5초 뒤 처형 → 시민 승
    for (const h of people) await guiltyUi(h.page);
    await botDo(citizenBot, 'cast_tribunal_vote', { gameId: t.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' }, '봇 재판 표');
    const end = await waitState(t, (g) => g.phase === 'ENDED', '처형으로 판 끝', 30_000);
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    // PC 셋·모바일 둘 모두 같은 결과판
    for (const h of people) {
        const list = await toResult(h.page);
        if (phones.includes(h)) await closeAd(h.page);
        await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
        await expect(list.getByRole('listitem')).toHaveCount(7);
        for (const p of end.players) {
            await expect(resultRow(h.page, p.nickname).getByText(RESULT_JOB[p.role], { exact: true }), `${p.nickname} 직업`).toHaveCount(1);
        }
        await expect(myChip(h)).toHaveText('+1골드');
        await expectReadable(myChip(h));
    }
});
