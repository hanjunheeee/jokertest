'use strict';

// 모바일 사람 5명이 한 판을 처음부터 끝까지 하는 브라우저 시험 (어려움) — 세로 카톡형 화면으로 낮 투표(플레이어 목록)·재판("최후의 변론" 시트)·밤 암살("직업 행동" 목록)을 해서 판을 끝내고 결과판을 사람마다 봄
// 목록 A07-승패-결과-골드.md 번호 A07-H-041~042 (PC 5명 판 A07-H-001~002를 모바일로 옮김, 단계 넘기기 손잡이는 토론·밤 차례 기다림에만), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a07-full-game.spec.js
const { test, expect, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { Table } = require('../../helpers/game');
const ui = require('../../helpers/ui');
const { resultRow } = require('../room/roomHelpers');
const { wallet } = require('../store/store-tools');
const R = require('../room/_a01a-kit');
const N = require('../ingame/b-night/_night');
const { clearOverlays, pickPlayer, openTrialSheet } = require('./_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: 모바일 사람 여럿 판 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });
const myChip = (who) => resultRow(who.page, nick(who)).getByTestId('game-result-gold-reward');
const abstainButton = (page) => page.getByRole('button', { name: '기권' });

async function openPhones(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add({ mobile: true }));
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

/**
 * 모바일 사람이 방장인 판 차리기: 화면으로 방 만들기 → 손님 코드 입장·준비 → 역할 → 방장 준비·시작 (PC roomHelpers hostGame과 같은 차례)
 * 대기방 인원은 모바일 화면 글 대신 서버 방 요약으로 봄
 */
async function hostPhoneGame({ host, guests, roles, settings }) {
    const room = await R.createRoomOn(host, settings);
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, room.roomCode);
    for (const g of guests) await ui.readyUi(g.page);
    for (const g of guests) await expect(g.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await e2e.setRoles(roles);
    await expect.poll(async () => (await e2e.roomOf(U(host)))?.players?.length, { message: '대기방 인원' }).toBe(1 + guests.length);
    await ui.readyUi(host.page);
    await expect(host.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await host.page.getByRole('button', { name: '게임시작' }).click();
    for (const p of [host, ...guests]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room, bots: [], humans: [host, ...guests] });
    t.gameId = (await e2e.gameOf(U(host))).gameId;
    return t;
}

// 역할 창을 닫고 1일 낮 투표까지 (토론은 손잡이로 넘김), 산 사람 화면마다 기권 단추가 보일 때까지
async function toFirstVote(t) {
    for (const h of t.humans) await ui.readRoleReveal(h.page);
    await t.advanceUntil('DAY_VOTE');
    for (const h of t.humans) {
        await expect(async () => {
            await clearOverlays(h.page, { keepWatching: false, rounds: 2 });
            await expect(abstainButton(h.page)).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 20_000 });
    }
}

// 낮 표: 플레이어 목록 시트 그 사람 줄 "투표하기" → 그 줄이 "투표취소"면 서버가 받은 것
async function votePhone(page, nickname) {
    await expect(async () => {
        await clearOverlays(page, { keepWatching: false, rounds: 2 });
        await pickPlayer(page, nickname, '투표하기', { after: '투표취소' });
    }).toPass({ timeout: 30_000 });
}

// 기권: 행동 줄 기권 단추 → 꺼지면 서버가 받은 것
async function abstainPhone(page) {
    await expect(async () => {
        await clearOverlays(page, { keepWatching: false, rounds: 2 });
        await abstainButton(page).click({ timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await expect(abstainButton(page)).toBeDisabled();
}

// 재판 유죄: 고발 연출 뒤 "최후의 변론" 시트 → "유죄" → 단추가 사라지고 완료 글이면 서버가 받은 것
async function guiltyPhone(page) {
    const sheet = await openTrialSheet(page);
    await sheet.getByRole('button', { name: '유죄', exact: true }).click();
    await expect(sheet.getByRole('button', { name: '유죄', exact: true })).toHaveCount(0);
    await expect(sheet.getByText('투표가 완료되었습니다.', { exact: true })).toBeVisible();
}

// 밤 암살: "직업 행동" 목록 그 사람 줄 "암살" → 그 줄이 "취소하기"면 서버가 받은 것
async function killPhone(page, nickname) {
    await expect(async () => {
        await clearOverlays(page, { keepWatching: false, rounds: 2 });
        await pickPlayer(page, nickname, '암살', { after: '취소하기' });
    }).toPass({ timeout: 30_000 });
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

// 결과판이 보일 때까지 (가는 길을 막는 연출만 넘김) → 판 끝 광고 창(결과판을 덮음)을 닫고 결과판
async function toResult(page, { timeout = 60_000 } = {}) {
    const list = resultBoard(page);
    await expect(async () => {
        await passCovers(page);
        await expect(list).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    await expect(page).toHaveURL(/\/gameresult/);
    await ui.closeResultAd(page);
    return list;
}

// 지갑 골드 (DB) · 그 값이 될 때까지 (판 골드는 판 끝 저장 뒤에 들어옴)
const goldOf = async (uuid) => (await wallet(uuid)).gold;
async function expectGold(uuid, amount) {
    await expect.poll(() => goldOf(uuid), { timeout: 30_000, message: '지갑 골드' }).toBe(amount);
}

// ── 사람만 5명 (모두 모바일 세로 375×812) ──

test('A07-H-041 모바일 사람 5명 판 처음부터 끝까지 시민 승 — 목록으로 낮 투표·"최후의 변론" 시트 유죄 → 다섯 화면 "시민 진영 승리", 이긴 편 "승리"·진 편 "패배", 전원 "+1골드"·지갑 +1 @game @hard @smoke', async ({ players }) => {
    test.setTimeout(480_000);
    const people = await openPhones(players, 5);
    const [joker, ...citizens] = people;
    const before = await Promise.all(people.map((h) => goldOf(U(h))));
    const roles = Object.fromEntries(people.map((h) => [U(h), h === joker ? 'JOKER' : 'CITIZEN']));
    const t = await hostPhoneGame({ host: joker, guests: citizens, roles, settings: { jokers: 1 } });
    expectRoles(await t.state(), roles);

    // 1일 낮: 시민 넷이 광대를 찍고 광대는 기권 → 다섯 다 내서 5초 뒤 재판
    await toFirstVote(t);
    for (const h of citizens) await votePhone(h.page, nick(joker));
    await abstainPhone(joker.page);
    await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === U(joker), '다 낸 뒤 재판', 30_000);

    // 재판: 시민 넷 유죄 (피고는 못 냄) → 다 내서 5초 뒤 처형 → 산 광대 0
    for (const h of citizens) await guiltyPhone(h.page);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '처형으로 판 끝', 30_000);
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    for (const h of people) {
        const list = await toResult(h.page);
        await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
        await expectReadable(h.page.getByText(h === joker ? '패배' : '승리', { exact: true }), { large: true, uncovered: false });
        await expect(myChip(h)).toHaveText('+1골드');
    }
    for (const [i, h] of people.entries()) await expectGold(U(h), before[i] + 1);
});

test('A07-H-042 모바일 사람 5명 판(광대 2) 처음부터 끝까지 광대 승 — 1일 밤 광대 둘이 "직업 행동" 목록으로 같은 시민 암살 → 다섯 화면 "광대 진영 승리", 전원 "+1골드" @game @hard', async ({ players }) => {
    test.setTimeout(480_000);
    const people = await openPhones(players, 5);
    const [j1, j2, victim] = people;
    const roles = Object.fromEntries(people.map((h, i) => [U(h), i < 2 ? 'JOKER' : 'CITIZEN']));
    const t = await hostPhoneGame({ host: j1, guests: people.slice(1), roles, settings: { jokers: 2 } });
    expectRoles(await t.state(), roles);
    for (const h of people) await ui.readRoleReveal(h.page);

    // 1일 낮은 아무도 안 찍어 재판 없이 밤 → 광대 차례에 둘이 같은 시민을 고름 → 광대 2 : 나머지 2
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    for (const j of [j1, j2]) await killPhone(j.page, nick(victim));
    const end = await N.toEnd(t);
    expect(end?.winResult?.winner, '서버 승자').toBe('JOKER');

    for (const [i, h] of people.entries()) {
        const list = await toResult(h.page);
        await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
        await expectReadable(h.page.getByText(i < 2 ? '승리' : '패배', { exact: true }), { large: true, uncovered: false });
        // 죽은 시민도 판 끝까지 있었으니 받음
        await expect(myChip(h)).toHaveText('+1골드');
    }
});
