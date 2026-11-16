'use strict';

// 모바일 승패가 갈리는 길 브라우저 시험 — 재판·밤 암살·나가기·60초 탈락으로 판이 끝나면 결과 화면에 이긴 진영, 무죄·의사가 살리면 판 계속
// 목록 A07-승패-결과-골드.md 번호 A07-E-064~068·093~095 (앞 단계·끊김 60초는 손잡이로 넘김), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a07-win-paths.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { playToResult } = require('../room/roomHelpers');
const { talk, startTalkGame } = require('./_talk');
const N = require('../ingame/b-night/_night');

// ── 이 파일 도우미 (공용으로 올릴 후보: A07 승패·결과 묶음) ──

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
const resultBoard = (page) => page.getByRole('region', { name: '가면무도회 참가자 정체' });

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

// 봇이 판에서 나가기 (산 채로 나가면 죽은 것으로 바뀌고 바로 승패 확인)
const botLeave = (t, bot) => botDo(bot, 'leave_game_session', { gameId: t.gameId }, '봇 나가기');

// 봇 소켓을 끊고(탭 닫은 것과 같음) 60초 기다림을 손잡이로 바로 끝냄 → 그 봇 탈락
async function dropBot(t, bot) {
    bot.socket.disconnect();
    await expect.poll(async () => (await t.expireGraces()).fired, { timeout: 15_000, message: '끊김 60초 기다림이 걸림' }).toContain(U(bot));
    await waitState(t, (g) => g.players.find((p) => p.uuid === U(bot))?.alive === false, '60초 탈락');
}

// 밤 암살: 그 밤 광대 차례까지 넘김 → 광대 봇 전원이 같은 사람을 고름 (둘이 다르면 아무도 안 죽음) → 그 사람이 죽을 때까지 넘김
async function killAtNight(t, jokerBots, victimUuid, dayIndex) {
    await N.toTurn(t, 'JOKER', { dayIndex });
    for (const bot of jokerBots) {
        const reply = await N.botNight(t, bot, victimUuid);
        expect(reply?.ok, `밤 암살 거절: ${reply?.code}`).toBe(true);
    }
    return N.advanceUntilSettled(t, (s) => s.players.find((p) => p.uuid === victimUuid)?.alive === false, { allowEnd: true });
}

// 낮 시작 연출 기록 걸기: 암살 영상 창이 뜬 횟수, 영상 아래 글·글 창(영상이 못 돌 때)의 글 — 판 화면에 들어온 뒤 부름 (결과 화면까지 남음)
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
                if (!seen.has(el)) { seen.add(el); rec.messages.push((el.innerText || '').replace(/\s+/g, ' ').trim()); }
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

// 판 끝 광고 창(결과가 다 나타나고 1.5초 뒤, 5초 뒤 "닫기")은 결과판을 덮음 → 보임 확인·단추 누르기 전에 닫음 (광고가 꺼진 빌드면 그냥 지나감)
async function closeAd(page) {
    const ad = page.getByRole('dialog', { name: '광고' });
    const shown = await ad.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
    if (!shown) return;
    await ad.getByRole('button', { name: '닫기' }).click({ timeout: 10_000 });
    await expect(ad).toHaveCount(0);
}

// 판이 안 끝났는지: 판 요약에 승패 없음 + 화면이 판 화면 그대로(결과판 없음)
async function expectStillPlaying(t, page) {
    const s = await t.state();
    expect(s.winResult, '승패가 아직 없음').toBeNull();
    expect(s.phase, '판이 안 끝남').not.toBe('ENDED');
    await expect(page).toHaveURL(/\/ingame/);
    await expect(resultBoard(page)).toHaveCount(0);
    return s;
}

// ── 판이 끝나는 길 ──

test('A07-E-064 모바일 5명 판 재판으로 하나뿐인 광대 처형 → 결과 화면 "시민 진영 승리" @game @smoke', async ({ user, table }) => {
    // 사람 1(시민) + 봇 4, 봇 표로 광대 봇을 재판에 세워 처형
    const { end, list } = await playToResult({ user, table, kind: 'citizenWin' });
    expect(end?.winResult?.winner, '서버 승자').toBe('CITIZEN');
    await closeAd(user.page);
    await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
});

test('A07-E-065 모바일 6명 판(광대 2) 밤 암살로 광대 = 나머지 → 낮 시작 연출 뒤 "광대 진영 승리" @game @safari', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: 5,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER' }),
    });
    const [j1, j2, leaver, victim] = t.bots;
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(j1)]: 'JOKER', [U(j2)]: 'JOKER', [U(leaver)]: 'CITIZEN', [U(victim)]: 'CITIZEN' });
    await watchDawn(page);

    // 시민 봇 하나가 나가 광대 2 : 나머지 3 → 아직 안 끝남
    await botLeave(t, leaver);
    await expectStillPlaying(t, page);

    // 1일 밤 광대 둘이 같은 시민을 고름 → 광대 2 : 나머지 2
    const end = await killAtNight(t, [j1, j2], U(victim), 1);
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    const list = await toResult(page);
    // 결과 화면보다 먼저 낮 시작 연출 글이 떴음 (판 화면에서만 뜨는 글)
    const dawn = await readDawn(page);
    expect(dawn.messages.join(' | ')).toContain(`지난밤 ${nick(victim)}님이 살해당했습니다`);
    await closeAd(page);
    await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
});

test('A07-E-066 모바일 7명 판 하나뿐인 광대가 나감 → 바로 "시민 진영 승리" @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, { bots: 6, settings: PACE, roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER' }) });
    const joker = t.bots[0];
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(joker)]: 'JOKER' });

    await botLeave(t, joker);
    // 단계를 넘기지 않아도 나간 직후 승패가 남
    const end = await waitState(t, (g) => g.phase === 'ENDED', '광대가 나가자 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    const list = await toResult(page);
    await closeAd(page);
    await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
});

test('A07-E-067 모바일 8명 판(광대 2) 시민이 나가 광대 = 나머지 → "광대 진영 승리" @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: 7,
        settings: { jokerCount: 2, ...PACE },
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER' }),
    });
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER', [U(t.bots[1])]: 'JOKER' });

    // 광대 아닌 봇 3이 나감 → 광대 2 : 나머지 3 (나 + 봇 2) → 아직 안 끝남
    for (const bot of t.bots.slice(2, 5)) await botLeave(t, bot);
    await expectStillPlaying(t, page);

    // 하나 더 나감 → 광대 2 : 나머지 2
    await botLeave(t, t.bots[5]);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '수가 같아지자 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    const list = await toResult(page);
    await closeAd(page);
    await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
});

test('A07-E-068 모바일 10명 판(광대 2) 광대 봇 둘이 차례로 끊겨 60초 탈락 → "시민 진영 승리" @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: 9,
        settings: { jokerCount: 2, ...PACE },
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER' }),
    });
    const [j1, j2] = t.bots;
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(j1)]: 'JOKER', [U(j2)]: 'JOKER' });
    await t.advanceUntil('DAY');

    // 첫 광대 탈락 → 광대 1 : 나머지 8 → 아직 안 끝남
    await dropBot(t, j1);
    await expectStillPlaying(t, page);

    // 둘째 광대 탈락 → 산 광대 0
    await dropBot(t, j2);
    const end = await waitState(t, (g) => g.phase === 'ENDED', '마지막 광대 탈락으로 판 끝');
    expect(end.winResult?.winner, '서버 승자').toBe('CITIZEN');

    const list = await toResult(page);
    await closeAd(page);
    await expectReadable(list.getByText('시민 진영 승리', { exact: true }));
});

// ── 판이 계속되는 길 ──

test('A07-E-093 모바일 10명 판 재판 무죄 → 밤 화면, 결과 화면 안 뜸 @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: 9,
        settings: PACE,
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'CITIZEN' }),
    });
    const defendant = t.bots[1];
    const voters = t.bots.filter((b) => b !== defendant);
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(t.bots[0])]: 'JOKER', [U(defendant)]: 'CITIZEN' });

    // 낮 투표: 봇 8이 피고를 찍음 (사람·피고는 안 내서 기권 2) → 마감 → 재판
    await t.advanceUntil('DAY_VOTE');
    for (const bot of voters) await botDo(bot, 'cast_day_vote', { gameId: t.gameId, targetId: U(defendant) }, '봇 낮 표');
    await t.advance();
    const tribunal = await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === U(defendant), '재판이 열림');

    // 재판: 봇 전원 무죄 → 마감 → 처형 없음
    for (const bot of voters) {
        await botDo(bot, 'cast_tribunal_vote', { gameId: t.gameId, dayIndex: tribunal.dayIndex, vote: 'NOT_GUILTY' }, '봇 재판 표');
    }
    await t.advance();
    const night = await waitState(t, (g) => g.phase === 'NIGHT', '무죄 뒤 밤');
    expect(night.players.find((p) => p.uuid === U(defendant))?.alive, '피고는 살아 있음').toBe(true);

    await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });
    await expectStillPlaying(t, page);
});

test('A07-E-094 모바일 6명 판 광대가 고른 사람을 의사가 살림 → 아무도 안 죽고 다음 낮, 결과 화면 안 뜸 @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: 5,
        settings: PACE,
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'DOCTOR' }),
    });
    const [joker, doctor, target] = t.bots;
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(joker)]: 'JOKER', [U(doctor)]: 'DOCTOR' });

    // 1일 밤: 광대 봇 대상 = 의사 봇 대상
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    const kill = await N.botNight(t, joker, U(target));
    expect(kill?.ok, `밤 암살 거절: ${kill?.code}`).toBe(true);
    await N.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    const save = await N.botNight(t, doctor, U(target));
    expect(save?.ok, `밤 보호 거절: ${save?.code}`).toBe(true);

    const day2 = await N.toDay(t, { dayIndex: 2 });
    expect(day2.players.filter((p) => !p.alive), '죽은 사람 없음').toHaveLength(0);
    await expect(talk.phaseLine(page)).toContainText('낮 토론', { timeout: 15_000 });
    await expectStillPlaying(t, page);
});

test('A07-E-095 모바일 7명 판(광대 2) 밤 암살로 판 끝 → 암살 영상·"지난밤 ○○님이 살해당했습니다" 뒤 결과 화면 @game', async ({ user, table }) => {
    const page = user.page;
    const me = U(user);
    const t = await startTalkGame(table, user, {
        bots: 6,
        settings: customRoleSettings({ JOKER: 2 }, PACE),
        roles: ({ bots }) => ({ [me]: 'CITIZEN', [U(bots[0])]: 'JOKER', [U(bots[1])]: 'JOKER' }),
    });
    const [j1, j2, leaverA, leaverB, victim] = t.bots;
    expectRoles(await t.state(), { [me]: 'CITIZEN', [U(j1)]: 'JOKER', [U(j2)]: 'JOKER', [U(victim)]: 'CITIZEN' });
    await watchDawn(page);

    // 시민 봇 둘이 나가 광대 2 : 나머지 3 → 아직 안 끝남, 이때까지 연출 없음
    await botLeave(t, leaverA);
    await botLeave(t, leaverB);
    await expectStillPlaying(t, page);
    expect((await readDawn(page)).video, '밤 전엔 암살 영상 없음').toBe(0);

    // 1일 밤 암살 → 광대 2 : 나머지 2 → 판 끝
    const end = await killAtNight(t, [j1, j2], U(victim), 1);
    expect(end.winResult?.winner, '서버 승자').toBe('JOKER');

    const list = await toResult(page);
    // 결과 화면에 오기 전에 판 화면에서 암살 영상 창과 글이 떴음
    const dawn = await readDawn(page);
    expect(dawn.video, '암살 영상 창이 뜸').toBeGreaterThan(0);
    expect(dawn.messages.join(' | ')).toContain(`지난밤 ${nick(victim)}님이 살해당했습니다`);
    await closeAd(page);
    await expectReadable(list.getByText('광대 진영 승리', { exact: true }));
});
