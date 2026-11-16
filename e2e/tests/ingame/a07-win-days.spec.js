'use strict';

// 여러 날에 걸쳐 승패가 갈리는 브라우저 시험 (PC, 어려움) — 무죄·의사가 살림·기권이 많은 낮에는 판이 계속되고, 광대가 다 죽거나 수가 같아지는 순간에만 결과 화면
// 목록 A07-승패-결과-골드.md 번호 A07-H-016~020 (토론·밤 차례 기다림은 손잡이로 넘김), 돌리지 않고 모임만: npx playwright test --list tests/ingame/a07-win-days.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { query } = require('../../helpers/db');
const ui = require('../../helpers/ui');
const { closeReveals } = require('../room/roomHelpers');
const N = require('./b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

// 봇 방장 판은 단계 시간을 가장 길게 둠 — 단계는 손잡이·"다 내면 5초"로만 넘어감 (화면을 누르거나 기다리는 동안 진짜 마감이 먼저 오면 흐름이 엇갈림)
const PACE = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

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

const isDead = (s, uuid) => s.players.find((p) => p.uuid === uuid)?.alive === false;
const aliveBots = (t, s) => t.bots.filter((b) => s.players.find((p) => p.uuid === U(b))?.alive);

// 봇 요청 하나 보내고 서버가 받았는지 확인
async function botDo(bot, event, payload, what) {
    const reply = await bot.request(event, payload);
    expect(reply?.ok, `${what} 거절: ${reply?.code ?? '답 없음'}`).toBe(true);
    return reply;
}

// 봇이 판에서 나가기 (산 채로 나가면 죽은 것으로 바뀌고 바로 승패 확인)
const botLeave = (t, bot) => botDo(bot, 'leave_game_session', { gameId: t.gameId }, '봇 나가기');

// 그 날 낮 투표 단계까지 넘김 (밤에 아무도 안 고르면 아무도 안 죽고 다음 낮)
function toVoteOfDay(t, dayIndex) {
    return t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE' && s.dayIndex === dayIndex, { maxSteps: 60 });
}

// 낮 투표 단계에서 재판 열기: 산 봇(피고 빼고)이 그 사람을 찍음 → 마감 → 재판 (사람은 안 내서 기권, 최다 득표가 기권보다 많아야 열림)
async function openTribunal(t, targetUuid) {
    await t.assertBotsCanExecute(targetUuid);
    const s = await t.state();
    expect(s.dayPhase, '낮 투표 단계').toBe('DAY_VOTE');
    const voters = aliveBots(t, s).filter((b) => U(b) !== targetUuid);
    for (const bot of voters) await botDo(bot, 'cast_day_vote', { gameId: t.gameId, targetId: targetUuid }, '봇 낮 표');
    await t.advance();
    const tribunal = await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === targetUuid, '재판이 열림');
    return { voters, tribunal };
}

// 열린 재판 닫기: 봇 전원이 같은 표 → 마감 → 재판을 벗어난 판 요약
async function closeTribunal(t, { voters, tribunal }, vote) {
    for (const bot of voters) {
        await botDo(bot, 'cast_tribunal_vote', { gameId: t.gameId, dayIndex: tribunal.dayIndex, vote }, '봇 재판 표');
    }
    await t.advance();
    return waitState(t, (g) => g.phase !== 'TRIBUNAL', '재판 끝');
}

// 밤 암살: 그 밤 광대 차례까지 넘김 → 광대 봇 전원이 같은 사람을 고름 (둘이 다르면 아무도 안 죽음) → 그 사람이 죽을 때까지 넘김
async function killAtNight(t, jokerBots, victimUuid, dayIndex) {
    await N.toTurn(t, 'JOKER', { dayIndex });
    for (const bot of jokerBots) {
        const reply = await N.botNight(t, bot, victimUuid);
        expect(reply?.ok, `밤 암살 거절: ${reply?.code}`).toBe(true);
    }
    return N.advanceUntilSettled(t, (s) => isDead(s, victimUuid), { allowEnd: true });
}

// 낮 시작 연출 기록 걸기: 암살 영상 창이 뜬 횟수, 영상 아래 글·글 창의 글 — 글 창은 적은 뒤 "확인"을 눌러 줌 (안 누르면 그 뒤 화면이 밀림)
async function watchDawn(page) {
    await page.evaluate(() => {
        if (window.__a07Dawn) return;
        const rec = { video: 0, messages: [] };
        window.__a07Dawn = rec;
        const seen = new WeakSet();
        const scan = () => {
            for (const el of document.querySelectorAll('[data-ingame-night-success-kill]')) {
                if (!seen.has(el)) { seen.add(el); rec.video += 1; }
            }
            for (const el of document.querySelectorAll('[data-ingame-dawn-report-message], [data-ingame-dawn-report]')) {
                if (seen.has(el)) continue;
                seen.add(el);
                rec.messages.push((el.innerText || '').replace(/\s+/g, ' ').trim());
                const ok = [...el.querySelectorAll('button')].find((b) => b.innerText.trim() === '확인');
                if (ok) setTimeout(() => ok.click(), 300);
            }
        };
        new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        scan();
    });
}
const readDawn = (page) => page.evaluate(() => window.__a07Dawn ?? { video: 0, messages: [] });

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

// 판이 안 끝났는지: 판 요약에 승패 없음 + 사람 화면이 판 화면 그대로(결과판 없음)
async function expectStillPlaying(t, pages) {
    const s = await t.state();
    expect(s.winResult, '승패가 아직 없음').toBeNull();
    expect(s.phase, '판이 안 끝남').not.toBe('ENDED');
    for (const page of pages) {
        await expect(page).toHaveURL(/\/ingame/);
        await expect(resultBoard(page)).toHaveCount(0);
    }
    return s;
}

// 브라우저 확인 창(window.confirm)을 수락하며 fn을 돌림 (나가기 확인)
async function acceptingConfirm(page, fn) {
    const onDialog = (dialog) => { dialog.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    try {
        return await fn();
    } finally {
        page.off('dialog', onDialog);
    }
}

// 산 사람이 판에서 나가기: 위 줄 "게임 나가기" → 확인 창 수락 → 방 찾기 화면 (막는 안내 창은 닫으면서)
async function leaveAliveUi(page) {
    await acceptingConfirm(page, () => expect(async () => {
        if (!/\/multiplay/.test(page.url())) {
            await passCovers(page);
            await ui.closeOverlays(page, { keepWatching: false, rounds: 2, clickTimeoutMs: 1000 });
            await page.locator('[aria-label="인게임 컨트롤"]').getByRole('button', { name: '게임 나가기' }).click({ timeout: 1500 }).catch(() => {});
        }
        await expect(page).toHaveURL(/\/multiplay/, { timeout: 4000 });
    }).toPass({ timeout: 30_000 }));
}

// 죽은 뒤 관전: "사망 후 선택" 창의 "관전 계속하기" (처형 연출이 창을 잠깐 가려서 눌릴 때까지)
async function keepWatchingUi(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await passCovers(page);
        await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 2000 });
    }).toPass({ timeout: 45_000 });
    await expect(dialog).toBeHidden();
}

// 그 판 판 골드 장부 줄을 받은 사람 uuid (정렬, 같은 사람이 두 줄이면 두 번 나옴) — 참조 id는 game-reward:<판 id>
async function rewardedUuids(gameId) {
    const rows = await query(
        "SELECT user_id FROM economy_ledger_entries WHERE reason = 'GAME_REWARD' AND reference_event_id = ?",
        [`game-reward:${gameId}`],
    );
    return rows.map((r) => r.user_id).sort();
}

// ── 시험 ──

test('A07-H-016 사람 2 + 봇 5 = 7명 판 1일 재판 무죄 → 밤에 의사가 살림 → 2일 광대 처형 → "시민 진영 승리", 그 전엔 결과 화면 없음 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const pages = [a.page, b.page];
    const t = await table.setup({
        humans: [a, b],
        bots: 5,
        settings: PACE,
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'DOCTOR', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }),
    });
    const [jokerBot, doctorBot, accused, saved] = t.bots;
    expectRoles(await t.state(), { [U(jokerBot)]: 'JOKER', [U(doctorBot)]: 'DOCTOR', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' });
    await closeReveals(pages);

    // 1일: 봇 넷이 시민 봇을 찍어 재판 (표 4 > 기권 3) → 전원 무죄 → 처형 없이 밤
    await toVoteOfDay(t, 1);
    const trial = await openTribunal(t, U(accused));
    const night1 = await closeTribunal(t, trial, 'NOT_GUILTY');
    expect(night1.phase, '무죄 뒤 밤').toBe('NIGHT');
    expect(isDead(night1, U(accused)), '피고는 살아 있음').toBe(false);
    await expectStillPlaying(t, pages);

    // 1일 밤: 광대 봇이 고른 사람을 의사 봇이 지킴 → 아무도 안 죽고 2일 낮
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    const kill = await N.botNight(t, jokerBot, U(saved));
    expect(kill?.ok, `밤 암살 거절: ${kill?.code}`).toBe(true);
    await N.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    const save = await N.botNight(t, doctorBot, U(saved));
    expect(save?.ok, `밤 보호 거절: ${save?.code}`).toBe(true);
    const day2 = await N.toDay(t, { dayIndex: 2 });
    expect(day2.players.filter((p) => !p.alive), '죽은 사람 없음').toHaveLength(0);
    for (const page of pages) {
        await expect(page.locator('[data-ingame-dawn-report]')).toContainText('지난밤 의사가 공격받은 사람을 살려냈습니다', { timeout: 15_000 });
    }
    await expectStillPlaying(t, pages);

    // 2일: 봇 넷이 광대 봇을 찍어 재판 (표 4 > 기권 3) → 전원 유죄 → 처형 → 산 광대 0
    await toVoteOfDay(t, 2);
    const last = await openTribunal(t, U(jokerBot));
    const end = await closeTribunal(t, last, 'GUILTY');
    expect(end.phase, '광대 처형으로 판 끝').toBe('ENDED');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    for (const page of pages) {
        const list = await toResult(page);
        await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
    }
});

test('A07-H-017 사람 3 + 봇 5 = 8명 판(광대 2) 밤 암살·재판 처형이 섞여 3일 밤 끝에 수가 같아짐 → "광대 진영 승리" @game @hard', async ({ players, table }) => {
    test.setTimeout(480_000);
    const [a, b, c] = await openHumans(players, 3);
    const pages = [a.page, b.page, c.page];
    const humanRoles = Object.fromEntries([a, b, c].map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: [a, b, c],
        bots: 5,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER', ...humanRoles }),
    });
    const [j1, j2, v1, v2, v3] = t.bots;
    expectRoles(await t.state(), { [U(j1)]: 'JOKER', [U(j2)]: 'JOKER', ...humanRoles });
    await closeReveals(pages);

    // 1일 밤 암살 → 광대 2 : 나머지 5
    await killAtNight(t, [j1, j2], U(v1), 1);
    await expectStillPlaying(t, pages);

    // 2일 재판: 산 봇 넷이 사람 ㄷ을 찍어 (표 4 > 기권 3) 유죄 → 처형 → 광대 2 : 나머지 4
    await toVoteOfDay(t, 2);
    const trial = await openTribunal(t, U(c));
    const afterTrial = await closeTribunal(t, trial, 'GUILTY');
    expect(isDead(afterTrial, U(c)), 'ㄷ 처형').toBe(true);
    await keepWatchingUi(c.page);
    await expectStillPlaying(t, pages);

    // 2일 밤 암살 → 광대 2 : 나머지 3 (아직 계속)
    await killAtNight(t, [j1, j2], U(v2), 2);
    await expectStillPlaying(t, pages);

    // 3일 낮은 아무도 안 찍어 밤으로 → 3일 밤 암살 → 광대 2 : 나머지 2
    const end = await killAtNight(t, [j1, j2], U(v3), 3);
    expect(end.phase, '수가 같아져 판 끝').toBe('ENDED');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    // 산 사람 둘·죽어서 관전하던 사람 모두 결과 화면
    for (const page of pages) {
        const list = await toResult(page);
        await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
    }
});

test('A07-H-018 사람 2 + 봇 8 = 10명 판(광대 2) 둘째 밤 암살로 판 끝 → 두 사람 다 낮 시작 연출(영상 창 + 글) 뒤 결과 화면 @game @hard', async ({ players, table }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const pages = [a.page, b.page];
    const t = await table.setup({
        humans: [a, b],
        bots: 8,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }),
    });
    const [j1, j2, ...citizens] = t.bots;
    const [first, second] = citizens.slice(4);
    expectRoles(await t.state(), { [U(j1)]: 'JOKER', [U(j2)]: 'JOKER', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' });
    await closeReveals(pages);
    for (const page of pages) await watchDawn(page);

    // 시민 봇 넷이 나가 광대 2 : 나머지 4 (사람 둘 + 봇 둘)
    for (const bot of citizens.slice(0, 4)) await botLeave(t, bot);
    await expectStillPlaying(t, pages);

    // 첫 밤 암살 → 광대 2 : 나머지 3 → 판 계속
    await killAtNight(t, [j1, j2], U(first), 1);
    await expectStillPlaying(t, pages);

    // 둘째 밤 암살 → 광대 2 : 나머지 2 → 판 끝
    const end = await killAtNight(t, [j1, j2], U(second), 2);
    expect(end.phase, '둘째 밤에 판 끝').toBe('ENDED');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    for (const page of pages) {
        const list = await toResult(page);
        // 결과 화면에 오기 전에 판 화면에서 암살 영상 창과 둘째 밤 희생자 글이 떴음
        const dawn = await readDawn(page);
        expect(dawn.video, '암살 영상 창이 뜸').toBeGreaterThan(0);
        expect(dawn.messages.join(' | ')).toContain(`지난밤 ${nick(second)}님이 살해당했습니다`);
        await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
    }
});

test('A07-H-019 사람 2 + 봇 4 = 6명 판(광대 2) 1표·5기권 → 재판 없이 밤(판 계속) → 밤 암살로 수가 같아져 "광대 진영 승리" @game @hard', async ({ players, table }) => {
    test.setTimeout(420_000);
    const [a, b] = await openHumans(players, 2);
    const pages = [a.page, b.page];
    const t = await table.setup({
        humans: [a, b],
        bots: 4,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' }),
    });
    const [j1, j2, voter, voted] = t.bots;
    expectRoles(await t.state(), { [U(j1)]: 'JOKER', [U(j2)]: 'JOKER', [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' });
    await closeReveals(pages);

    // 1일 낮 투표: 시민 봇 하나만 다른 시민 봇을 찍고 봇 셋은 기권, 사람 둘은 안 내서 기권 → 1표·5기권
    await toVoteOfDay(t, 1);
    await botDo(voter, 'cast_day_vote', { gameId: t.gameId, targetId: U(voted) }, '봇 낮 표');
    for (const bot of [j1, j2, voted]) await botDo(bot, 'cast_day_vote', { gameId: t.gameId, targetId: null }, '봇 기권');
    await t.advance();
    // 기권이 더 많아 재판 없이 밤, 아무도 안 죽음
    const night1 = await waitState(t, (g) => g.phase !== 'DAY', '낮 투표 판정');
    expect(night1.phase, '재판 없이 밤').toBe('NIGHT');
    expect(night1.players.filter((p) => !p.alive), '죽은 사람 없음').toHaveLength(0);
    await expectStillPlaying(t, pages);

    // 1일 밤 암살 → 광대 2 : 나머지 3 (계속) → 2일 밤 암살 → 광대 2 : 나머지 2
    await killAtNight(t, [j1, j2], U(voter), 1);
    await expectStillPlaying(t, pages);
    const end = await killAtNight(t, [j1, j2], U(voted), 2);
    expect(end.phase, '수가 같아져 판 끝').toBe('ENDED');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    for (const page of pages) {
        const list = await toResult(page);
        await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
    }
});

test('A07-H-020 사람 3 + 봇 4 = 7명 판(광대 2) 시민 사람 둘이 같은 순간 나감 → 남은 사람 결과 화면 한 번, 판 끝 알림 한 번, 장부 사람마다 한 줄 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const [stayer, leaverA, leaverB] = await openHumans(players, 3);
    const humanRoles = Object.fromEntries([stayer, leaverA, leaverB].map((h) => [U(h), 'CITIZEN']));
    const t = await table.setup({
        humans: [stayer, leaverA, leaverB],
        bots: 4,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER', ...humanRoles }),
    });
    const [j1, j2, firstOut, stayBot] = t.bots;
    expectRoles(await t.state(), { [U(j1)]: 'JOKER', [U(j2)]: 'JOKER', ...humanRoles });
    await closeReveals([stayer, leaverA, leaverB].map((h) => h.page));
    await t.advanceUntil('DAY');

    // 시민 봇 하나가 먼저 나가 광대 2 : 나머지 4 → 판 계속
    await botLeave(t, firstOut);
    await expectStillPlaying(t, [stayer.page, leaverA.page, leaverB.page]);

    // 남은 사람 화면에서 결과 연출이 몇 번 시작되는지 셈
    await stayer.page.evaluate(() => {
        window.__a07Intro = 0;
        let last = null;
        new MutationObserver(() => {
            const el = document.querySelector('[data-game-result-intro]');
            if (el && el !== last) window.__a07Intro += 1;
            last = el;
        }).observe(document.body, { childList: true, subtree: true });
    });

    // 시민 사람 둘이 같은 순간 나감 → 광대 2 : 나머지 2
    await Promise.all([leaveAliveUi(leaverA.page), leaveAliveUi(leaverB.page)]);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '수가 같아져 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    // 남은 사람: 결과 화면이 한 번만 열림
    const list = await toResult(stayer.page);
    await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
    expect(await stayer.page.evaluate(() => window.__a07Intro), '결과 연출이 시작된 횟수').toBe(1);

    // 남은 봇이 받은 탈락 알림 가운데 판 끝 칸이 실린 것은 하나
    const endings = N.eventsOf(stayBot, 'player_eliminated').filter((p) => p?.winResult);
    expect(endings, '판 끝 칸이 실린 알림').toHaveLength(1);

    // 장부: 끝까지 있던 넷(사람 1·광대 봇 2·시민 봇 1)만 한 줄씩, 나간 셋은 없음
    await expect.poll(() => rewardedUuids(t.gameId), { timeout: 30_000, message: '판 골드 장부 줄' })
        .toEqual([stayer, j1, j2, stayBot].map(U).sort());
});
