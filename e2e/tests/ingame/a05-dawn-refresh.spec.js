'use strict';

// 새로고침한 사람에게 지난 낮 시작 연출(암살 영상·살림 글 창)·밤 영상을 다시 틀지 않는지 보는 브라우저 시험, PC 사람 1명(산 시민) + 봇 5 = 6명 판
// 목록 A05b-밤-알림-낮연출.md A05-E-574~578 (5개) — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-dawn-refresh.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');

// ---- 이 파일 안 도우미 (공용 도우미는 못 고쳐서 A05b 브라우저 시험 파일마다 같은 모양으로 둠) ----

// 화면에서 찾는 표시·글 (frontend/src/domains/game/ingame 코드에서 확인한 것)
const KILL = '[data-ingame-night-success-kill]';
const KILL_MESSAGE = '[data-ingame-dawn-report-message]';
const SAVED = '[data-ingame-dawn-report="SAVED"]';
const DAWN_ANY = '[data-ingame-night-success-kill], [data-ingame-dawn-report]';
const SAVED_TEXT = '지난밤 의사가 공격받은 사람을 살려냈습니다';
const WAIT_TEXT = '진행을 기다리는 중입니다.';
const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`;
// 시간 바의 날짜 글 (밤은 그 날 숫자 그대로, 다음 낮은 +1) → dayBar(2) = '제 2일 시간 흐름'
const dayBar = (dayIndex) => `제 ${dayIndex}일 시간 흐름`;

// 화면 지켜보기 (페이지 안에서 돎): 뜨고 사라진 것을 차례대로 적음 → [{ what, value, day, at }]
// what: kill(암살 영상)·message(영상 위 글)·report(낮 시작 글 창)·private(내 결과 창)·entrance(단계 안내 창)·turn(밤 차례 안내 창)
//       ·settle(5초 표시)·wait(기다림 창 글)·day(날짜 글)·path(주소)·pick(카드 메뉴 누름)·timer(상태 글|남은 시간), 사라지면 뒤에 ':off'
// day: 그때 시간 바 날짜 글 → 밤에 뜬 것인지 낮에 뜬 것인지 가림, at: 뜬 시각(ms)
function installWatch(opts) {
    if (window.__a05bWatch) return;
    const log = [];
    window.__a05bWatch = log;
    const last = {};
    const q = (selector) => document.querySelector(selector);
    const dayLabel = () => q('[aria-label$="시간 흐름"]')?.getAttribute('aria-label') ?? null;
    const dayNo = () => Number(/제 (\d+)일/.exec(dayLabel() ?? '')?.[1] ?? 0);
    // 값이 바뀔 때만 한 줄 (같은 창이 그대로 떠 있는 동안엔 안 적음)
    const mark = (what, value) => {
        const now = value ?? null;
        if (now === (last[what] ?? null)) return;
        last[what] = now;
        log.push({ what: now === null ? `${what}:off` : what, value: now, day: dayLabel(), at: Date.now() });
    };
    const scan = () => {
        mark('kill', q('[data-ingame-night-success-kill]') ? 'on' : null);
        mark('message', q('[data-ingame-dawn-report-message]')?.textContent.replace(/\s+/g, ' ').trim());
        mark('report', q('[data-ingame-dawn-report]')?.getAttribute('data-ingame-dawn-report'));
        mark('private', q('[data-ingame-night-private-result]')?.getAttribute('data-ingame-night-private-result'));
        mark('entrance', q('[data-ingame-phase-entrance]')?.getAttribute('data-ingame-phase-entrance'));
        // 앞 안내 창이 닫히는 움직임 중이면 둘이 겹침 → 맨 뒤(새로 뜬 것)를 봄
        mark('turn', [...document.querySelectorAll('[data-night-turn-role]')].at(-1)?.getAttribute('data-night-turn-role'));
        mark('settle', q('[data-ingame-phase-settle]') ? 'on' : null);
        mark('wait', document.body?.textContent.includes(opts.waitText) ? 'on' : null);
        if (opts.timer) {
            // 접힌 시간 바엔 남은 시간이 안 보임 → 펼침 단추를 눌러 둠 (5초 중엔 화면이 스스로 펼침)
            if (q('[data-ingame-timebar-expand][aria-expanded="false"]') && !last.expanding) {
                last.expanding = true;
                setTimeout(() => {
                    last.expanding = false;
                    q('[data-ingame-timebar-expand][aria-expanded="false"]')?.click();
                }, 0);
            }
            const clock = q('[role="timer"]')?.textContent.trim();
            // 상태 글은 "[밤-광대]"처럼 대괄호로 싸인 한 줄
            const status = [...document.querySelectorAll('p')].map((p) => p.textContent.trim()).find((text) => /^\[.+\]$/.test(text)) ?? '';
            mark('timer', clock ? `${status}|${clock}` : null);
        }
        mark('day', dayLabel());
        mark('path', window.location.pathname);
        // 단계 안내("낮이·밤이 되었습니다")는 정한 날 앞까지만 스스로 확인 (그 날부터는 시험이 직접 봄)
        if (q('[data-ingame-phase-entrance]') && dayNo() < opts.confirmBeforeDay && !last.confirming) {
            last.confirming = true;
            setTimeout(() => {
                last.confirming = false;
                if (dayNo() >= opts.confirmBeforeDay) return;
                [...document.querySelectorAll('[data-ingame-phase-entrance] button')].find((b) => b.textContent.trim() === '확인')?.click();
            }, 50);
        }
    };
    // 카드 메뉴 단추(암살·보호·조사·확인)를 누른 시각 — 5초 규칙을 "고른 때부터" 재려고
    document.addEventListener('click', (event) => {
        const item = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null;
        if (item) log.push({ what: 'pick', value: item.getAttribute('aria-label') ?? item.textContent.trim(), day: dayLabel(), at: Date.now() });
    }, true);
    new MutationObserver(scan).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    scan();
}

// 지켜보기 걸기 (판 화면에 들어온 뒤) — reload면 새로고침한 새 문서에도 다시 걸림(기록은 새 문서에서 새로 시작)
// confirmBeforeDay: 그 날 앞의 단계 안내 창은 스스로 확인 (기본 = 전부), timer: 남은 시간도 적음
async function watch(page, { reload = false, ...opts } = {}) {
    const all = { confirmBeforeDay: 99, timer: false, waitText: WAIT_TEXT, ...opts };
    if (reload) await page.addInitScript(installWatch, all);
    await page.evaluate(installWatch, all);
}
const readWatch = (page) => page.evaluate(() => window.__a05bWatch ?? []);
// 기록에서 고르기: 이름(+값·날짜 글)이 같은 줄 → seen(log, 'kill', { day: dayBar(2) })
const seen = (log, what, { value, day } = {}) => log.filter((e) => e.what === what
    && (value === undefined || e.value === value) && (day === undefined || e.day === day));
// 화면에 붙는 순간까지 프레임마다 봄 (5초짜리 영상·2초 뒤 닫히는 창을 늦게 알아채지 않게)
const appear = (page, selector, timeout = 60_000) => page.waitForFunction(
    (sel) => document.querySelector(sel) !== null, selector, { polling: 'raf', timeout });

// 인원마다 직접 구성 (자동 구성과 같은 모양을 직접 정해 둠: 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼)
const COUNTS = Object.freeze({
    5: { JOKER: 1 },
    6: { JOKER: 1, DOCTOR: 1 },
    7: { JOKER: 1, DOCTOR: 1 },
    8: { JOKER: 1, DOCTOR: 1, GUARD: 1 },
    10: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
});
const who = (bot) => ({ uuid: bot.account.uuid, nickname: bot.nickname });

// 판 차리기: size명(사람 1 + 봇), 사람 직업 humanRole, 직업 수 counts → 판·화면·직업별 봇 (봇은 시험이 시킬 때만 움직임)
// night: 밤 차례 길이(초) — 기본 120초, 토론은 150초 (화면 창을 닫고 보는 동안 단계가 저절로 안 넘어가게, 넘기기는 손잡이로)
async function openGame(table, user, { size, humanRole = 'CITIZEN', counts = COUNTS[size], night = 120 }) {
    // 직업 수 → 직업 줄 { JOKER: 1, DOCTOR: 1 } → ['JOKER', 'DOCTOR']
    const botRoles = Object.entries(counts).flatMap(([role, count]) => Array.from({ length: count }, () => role));
    if (humanRole !== 'CITIZEN') {
        const mine = botRoles.indexOf(humanRole);
        if (mine < 0) throw new Error(`구성에 ${humanRole} 자리가 없음`);
        botRoles.splice(mine, 1);
    }
    const t = await n.setup(table, {
        humans: [user], bots: size - 1, settings: n.custom(counts, { nightActionTime: night, dayDiscussionTime: 150 }), humanRoles: [humanRole], botRoles,
    });
    // 직업을 못 맞추면 도우미가 사람을 새 창으로 바꿈 → 화면·계정은 판을 차린 뒤에 꺼냄
    const page = user.page;
    // 역할 확인 창: 떠 있으면 확인, 10초가 지나 이미 닫혔으면 그냥 지나감
    const reveal = page.getByRole('dialog', { name: '내 역할 보기' });
    await reveal.getByRole('button', { name: '확인' }).click({ timeout: 8000 }).catch(() => {});
    await expect(reveal).toBeHidden({ timeout: 12_000 });
    const s = await t.state();
    expect(n.rowOf(s, user.account.uuid)?.role, '사람 직업 (준비)').toBe(humanRole);
    expect(s.players.length, '판 인원 (준비)').toBe(size);
    const botsOf = (role) => t.bots.filter((b) => n.rowOf(s, b.account.uuid)?.role === role);
    const citizenBots = botsOf('CITIZEN');
    return {
        t,
        page,
        botsOf,
        citizenBots,
        me: { uuid: user.account.uuid, nickname: user.account.nickname },
        players: s.players.map((p) => ({ uuid: p.uuid, nickname: p.nickname })),
        joker: botsOf('JOKER')[0] ?? null,
        doctor: botsOf('DOCTOR')[0] ?? null,
        guard: botsOf('GUARD')[0] ?? null,
        hunter: botsOf('WITCH_HUNTER')[0] ?? null,
        citizens: citizenBots.map(who),
    };
}

// 봇이 밤 행동을 소켓으로 냄 (targetUuid null = 건너뛰기) — 거절이면 바로 실패
async function botPick(g, bot, targetUuid) {
    const reply = await n.botNight(g.t, bot, targetUuid);
    expect(reply?.ok, `봇 밤 행동 (${reply?.code ?? '답 없음'})`).toBe(true);
}

// 떠 있는 낮 시작 연출이 끝날 때까지: 영상은 스스로 끝나고(멈춰서 뜬 "건너뛰기"는 누름), 글 창은 "확인" — 연출 자체를 안 보는 곳에서만 씀
async function passDawn(page) {
    const skip = page.locator(KILL).getByRole('button', { name: '건너뛰기' });
    await expect(async () => {
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await n.closeDawnReport(page);
        await expect(page.locator(DAWN_ANY)).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
}

// ---- 이 파일 시험 ----

// 6명 판을 차리고 지켜보기를 새로고침 뒤에도 걸리게 걺 (새 문서의 기록은 문서가 열리는 순간부터 새로 적힘)
async function openWatched(table, user) {
    const g = await openGame(table, user, { size: 6 });
    await watch(g.page, { reload: true });
    return g;
}

// 1일 밤: 봇 광대가 A를 고름 (save면 봇 의사도 A를 지킴) → 2일 낮, 연출(sel)이 붙는 순간까지
async function nightToDawn(g, target, { save, sel }) {
    await n.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await botPick(g, g.joker, target.uuid);
    if (save) {
        await n.toTurn(g.t, 'DOCTOR', { dayIndex: 1 });
        await botPick(g, g.doctor, target.uuid);
    }
    await Promise.all([n.toDay(g.t, { dayIndex: 2 }), appear(g.page, sel)]);
}

// 새로고침 → 판 화면이 다시 차려질 때까지(카드 생사가 서버 값대로 보임) → 새 문서에서 연출이 한 번도 안 뜸
async function reloadAndExpectNoDawn(g, cards) {
    await g.page.reload();
    for (const [nickname, status] of cards) await n.expectCard(g.page, nickname, status, 30_000);
    // 판이 다시 차려진 뒤 날짜 글까지 뜬 것 = 서버 값(스냅샷)을 다 받음 → 그때까지의 기록에 연출이 없어야 함
    await expect(g.page.locator('[aria-label$="시간 흐름"]')).toBeVisible();
    await expect(g.page.locator(DAWN_ANY)).toHaveCount(0);
    const log = await readWatch(g.page);
    for (const what of ['kill', 'message', 'report', 'wait']) expect(seen(log, what), `새로고침 뒤 ${what}`).toEqual([]);
    return log;
}

test('A05-E-574 6명 판 죽음 · 암살 영상이 도는 중 새로고침 → 영상 다시 안 뜸, A 카드는 사망 @game @smoke', async ({ user, table }) => {
    const g = await openWatched(table, user);
    const [victim, other] = g.citizens;
    await nightToDawn(g, victim, { save: false, sel: KILL });
    await expect(g.page.locator(KILL_MESSAGE)).toBeVisible();
    await reloadAndExpectNoDawn(g, [[victim.nickname, 'dead'], [other.nickname, 'alive']]);
});

test('A05-E-575 6명 판 죽음 · 암살 영상이 닫힌 뒤 새로고침 → 영상 다시 안 뜸, A 카드는 사망 @game', async ({ user, table }) => {
    const g = await openWatched(table, user);
    const [victim, other] = g.citizens;
    await nightToDawn(g, victim, { save: false, sel: KILL });
    await expect(g.page.locator(KILL)).toHaveCount(0, { timeout: 12_000 });
    await reloadAndExpectNoDawn(g, [[victim.nickname, 'dead'], [other.nickname, 'alive']]);
});

test('A05-E-576 6명 판 살림 · 살림 글 창이 떠 있는 중 새로고침 → 창 다시 안 뜸, 카드는 전원 생존 @game', async ({ user, table }) => {
    const g = await openWatched(table, user);
    const [target, other] = g.citizens;
    await nightToDawn(g, target, { save: true, sel: SAVED });
    await expect(g.page.locator(SAVED).getByText(SAVED_TEXT, { exact: true })).toBeVisible();
    await reloadAndExpectNoDawn(g, [[target.nickname, 'alive'], [other.nickname, 'alive']]);
});

test('A05-E-577 6명 판 살림 · 살림 글 창을 닫은 뒤 새로고침 → 창 다시 안 뜸, 카드는 전원 생존 @game', async ({ user, table }) => {
    const g = await openWatched(table, user);
    const [target, other] = g.citizens;
    await nightToDawn(g, target, { save: true, sel: SAVED });
    await passDawn(g.page);
    await reloadAndExpectNoDawn(g, [[target.nickname, 'alive'], [other.nickname, 'alive']]);
});

test('A05-E-578 6명 판 밤 중(광대 차례가 끝난 뒤) 새로고침 → 영상·기다림 창 안 뜸, A 카드는 아직 생존 → 낮에 영상 한 번 @game', async ({ user, table }) => {
    const g = await openWatched(table, user);
    const [victim, other] = g.citizens;
    await n.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await botPick(g, g.joker, victim.uuid);
    // 광대 차례를 닫고 의사 차례로 (봇 의사는 가만히 있음)
    await n.toTurn(g.t, 'DOCTOR', { dayIndex: 1 });
    await reloadAndExpectNoDawn(g, [[victim.nickname, 'alive'], [other.nickname, 'alive']]);
    // 이어서 낮이 되면 그때 영상이 한 번 뜨고 A 카드가 사망으로 바뀜 (새로고침이 판을 안 흔듦)
    await Promise.all([n.toDay(g.t, { dayIndex: 2 }), appear(g.page, KILL)]);
    await expectReadable(g.page.locator(KILL_MESSAGE), { timeout: 3000 });
    const log = await readWatch(g.page);
    expect(seen(log, 'kill').map((e) => e.day)).toEqual([dayBar(2)]);
    expect(seen(log, 'message').map((e) => e.value)).toEqual([killedText(victim.nickname)]);
    await n.expectCard(g.page, victim.nickname, 'dead');
});
