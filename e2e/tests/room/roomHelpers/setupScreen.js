'use strict';

// 게임 설정 화면 파일, 설정 칸 읽기·화살표로 맞추기·체크·탭 + 화면으로 방 만들고 서버 방 요약 받기
// roomHelpers/index.js가 다시 내보냄 (tests/room·tests/result는 require('./roomHelpers')로 씀)
const { expect } = require('@playwright/test');
const { e2e } = require('../../../helpers/internal');
const { ROLE_LABELS } = require('../../../helpers/ui');

/** 게임 설정 화면 열기 (방 찾기 거치지 않고 주소로) */
async function openSetup(page) {
    await page.goto('/game-setup');
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();
}

/** 설정 줄 하나 (좌우 화살표 이름으로 찾음) */
function stepperRow(page, label) {
    return page.locator('[data-setup-row]').filter({ has: page.getByRole('button', { name: `${label} 감소`, exact: true }) });
}

/** 숫자·고르기 칸 지금 글자 (예: '60초', '10', '자동') */
async function stepperValue(page, label) {
    return (await stepperRow(page, label).locator('div.relative > span').innerText()).trim();
}

/** 숫자 칸을 목표 값까지 화살표로 맞춤 (단위 글자는 떼고 비교) */
async function setStepper(page, label, target) {
    for (let i = 0; i < 16; i += 1) {
        const now = parseInt(await stepperValue(page, label), 10);
        if (now === target) return;
        await page.getByRole('button', { name: `${label} ${now < target ? '증가' : '감소'}`, exact: true }).click();
        await expect.poll(async () => parseInt(await stepperValue(page, label), 10)).not.toBe(now);
    }
    throw new Error(`${label}을 ${target}로 못 맞춤`);
}

/** 고르기 칸(역할 구성)을 글자로 맞춤 */
async function setChoice(page, label, text) {
    for (let i = 0; i < 4; i += 1) {
        if (await stepperValue(page, label) === text) return;
        const inc = page.getByRole('button', { name: `${label} 증가`, exact: true });
        if (await inc.isEnabled()) await inc.click();
        else await page.getByRole('button', { name: `${label} 감소`, exact: true }).click();
    }
    expect(await stepperValue(page, label)).toBe(text);
}

/** 체크 칸 켜기·끄기 */
async function setCheck(page, label, on) {
    const box = page.getByRole('checkbox', { name: label, exact: true });
    if ((await box.getAttribute('aria-checked')) !== String(on)) await box.click();
    await expect(box).toHaveAttribute('aria-checked', String(on));
}

/** 탭 고르기 ('일반' | '회의&투표') */
async function selectTab(page, name) {
    await page.getByRole('navigation', { name: '인게임 설정 탭' }).getByRole('button', { name, exact: true }).click();
}

// 역할 이름 화면 글자는 helpers/ui.js 것 그대로 (옛 이름 ROLE_LABEL)
const ROLE_LABEL = ROLE_LABELS;

/**
 * 열린 설정 패널 칸 채우기 (만들기·편집 둘 다)
 * @param {object} o code·maxPlayers·jokers·lightsOut·soulBetting·custom({JOKER..})·discussion·vote·tribunal·night·roleNights({JOKER:60})·voteReveal
 */
async function fillSettings(page, o = {}) {
    await selectTab(page, '일반');
    if (o.code !== undefined) await setCheck(page, '코드로만 참가', o.code);
    if (o.maxPlayers !== undefined) await setStepper(page, '최대 플레이어 수', o.maxPlayers);
    if (o.jokers !== undefined && !o.custom) await setStepper(page, '광대(마피아) 플레이어 수', o.jokers);
    if (o.lightsOut !== undefined) await setCheck(page, '불이 꺼진 무도회', o.lightsOut);
    if (o.soulBetting !== undefined) await setCheck(page, '영혼의 베팅 활성화', o.soulBetting);
    if (o.custom) {
        await setChoice(page, '역할 구성', '직접 지정');
        for (const [role, n] of Object.entries(o.custom)) await setStepper(page, `${ROLE_LABEL[role]} 인원`, n);
    }
    const meeting = ['discussion', 'vote', 'tribunal', 'night', 'roleNights', 'voteReveal'].some((k) => o[k] !== undefined);
    if (!meeting) return;
    await selectTab(page, '회의&투표');
    if (o.discussion !== undefined) await setStepper(page, '낮 토론 시간 조절', o.discussion);
    if (o.vote !== undefined) await setStepper(page, '낮 투표 시간 조절', o.vote);
    if (o.tribunal !== undefined) await setStepper(page, '재판 시간 조절', o.tribunal);
    if (o.night !== undefined) await setStepper(page, '밤 행동 시간 조절', o.night);
    for (const [role, n] of Object.entries(o.roleNights ?? {})) await setStepper(page, `${ROLE_LABEL[role]} 밤 시간 조절`, n);
    if (o.voteReveal !== undefined) await setCheck(page, '투표 공개 여부', o.voteReveal);
}

/** 서버 방 요약이 생길 때까지 (방장 uuid로) */
async function waitRoom(uuid, match = () => true) {
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(uuid); return Boolean(room && match(room)); }, { timeout: 10000 }).toBe(true);
    return room;
}

/**
 * 화면으로 방 만들기 → 대기방 → 서버 방 요약 돌려줌
 * @param {{page, account}} who 로그인된 사람
 */
async function createRoomUi(who, o = {}) {
    await openSetup(who.page);
    await fillSettings(who.page, o);
    await who.page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(who.page).toHaveURL(/\/game-matching/);
    await expect(who.page.getByRole('button', { name: '게임시작' })).toBeVisible();
    return waitRoom(who.account.uuid);
}
module.exports = { openSetup, stepperRow, stepperValue, setStepper, setChoice, setCheck, selectTab, fillSettings, waitRoom, createRoomUi, ROLE_LABEL };
