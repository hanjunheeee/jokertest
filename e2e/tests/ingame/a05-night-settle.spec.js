'use strict';

// 밤 차례: 그 직업 산 사람이 다 고르면 5초 뒤 차례가 닫히는 규칙 브라우저 시험 ("[5초 뒤 마감]" 표시·바꾸기·나가기·끊김·새로고침), PC 사람 1명 + 봇 — 전부 진짜 시간(@realtime)
// 목록 A05b-밤-알림-낮연출.md A05-E-593~614 (22개) — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-night-settle.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');

// ---- 이 파일 안 도우미 (공용 도우미는 못 고쳐서 A05b 브라우저 시험 파일마다 같은 모양으로 둠) ----

// 화면에서 찾는 표시·글 (frontend/src/domains/game/ingame 코드에서 확인한 것)
const KILL = '[data-ingame-night-success-kill]';
const KILL_MESSAGE = '[data-ingame-dawn-report-message]';
const DAWN_ANY = '[data-ingame-night-success-kill], [data-ingame-dawn-report]';
const SETTLE = '[data-ingame-phase-settle]';
const SETTLE_TEXT = '[5초 뒤 마감]';
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

// 봇 표만으로 그 사람을 처형: 낮 투표 → 재판 유죄 → 밤 (사람은 표를 안 내 기권으로 셈)
async function executeAtDay(t, targetUuid) {
    await n.advanceUntilSettled(t, (s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE');
    // 최다 득표가 기권보다 많아야 재판이 열림 → 모자라면 여기서 바로 알림
    await t.assertBotsCanExecute(targetUuid);
    const s = await t.state();
    const voters = t.bots.filter((b) => b.account.uuid !== targetUuid && n.rowOf(s, b.account.uuid)?.alive);
    for (const bot of voters) {
        const reply = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: targetUuid });
        expect(reply?.ok, `봇 낮 표 (${reply?.code ?? '답 없음'})`).toBe(true);
    }
    await t.advance();
    await expect.poll(async () => (await t.state())?.phase, { timeout: 15_000, message: '재판이 열림' }).toBe('TRIBUNAL');
    for (const bot of voters) {
        const reply = await bot.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: s.dayIndex, vote: 'GUILTY' });
        expect(reply?.ok, `봇 재판 표 (${reply?.code ?? '답 없음'})`).toBe(true);
    }
    await t.advance();
    await n.waitDead(t, targetUuid);
}

// 추방 연출이 화면에서 끝날 때까지 (영상이 멈추면 뜨는 "건너뛰기"는 누름) — 뒤 조작이 연출에 막히지 않게
async function passExpulsion(page) {
    const overlay = page.locator('[data-ingame-tribunal-expulsion]');
    await overlay.first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    // 연출 창 안의 "건너뛰기"만 (밤 차례의 건너뛰기 단추와 이름이 같아 잘못 누르지 않게)
    const skip = overlay.getByRole('button', { name: '건너뛰기' });
    await expect(async () => {
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await expect(overlay).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 45_000 });
}

// 사람이 1일 낮에 처형당해 관전자가 됨 → 추방 연출 뒤 "사망 후 선택" 창에서 "관전 계속하기"
async function getExecuted(g) {
    await executeAtDay(g.t, g.me.uuid);
    await passExpulsion(g.page);
    const dialog = g.page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(async () => {
        await dialog.getByRole('button', { name: '관전 계속하기' }).click({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await expect(dialog).toBeHidden();
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
// 손잡이 쓰는 곳: 보려는 밤이 되기 전까지만(역할 확인·낮·앞 밤). 보려는 밤 안에서는 단계 넘기기 손잡이를 한 번도 안 씀
// (손잡이가 차례 마감을 바로 돌려 "다 고르면 5초"까지 건너뛰기 때문) → 앞 차례 봇도 고르고 진짜 5초씩 기다림

const ORDER = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
const settleText = (page) => page.getByText(SETTLE_TEXT, { exact: true });

// 그 밤이 될 때까지만 단계를 넘김 (앞 밤은 차례마다 넘김)
async function advanceToNight(t, nightDay) {
    for (let step = 0; step < 60; step += 1) {
        const s = await t.state();
        if (s.phase === 'NIGHT' && s.dayIndex === nightDay) return;
        if (s.phase === 'ENDED') throw new Error('판이 먼저 끝남');
        await n.sleep(300);
        // 쉬는 사이 진짜 시계로 그 밤이 됐으면 넘기지 않음 (그 밤 차례 마감을 건드리지 않게)
        const again = await t.state();
        if (again.phase === 'NIGHT' && again.dayIndex === nightDay) return;
        await t.advance();
        await n.sleep(400);
    }
    throw new Error(`${nightDay}일 밤이 안 옴`);
}

// 그 직업 차례가 열릴 때까지 진짜로 기다림 (손잡이 없음)
async function waitTurn(t, role, timeout = 20_000) {
    await expect.poll(async () => (await t.state())?.nightTurnRole ?? null, { timeout, message: `${role} 차례가 열림` }).toBe(role);
}

// 내 차례 앞 직업 봇들이 차례대로 target을 고름 → 차례마다 진짜 5초 뒤 닫힘
async function botsGoFirst(g, role, target) {
    for (const earlier of ORDER.slice(0, ORDER.indexOf(role))) {
        const [bot] = g.botsOf(earlier);
        // 판에 없는 직업은 차례도 없음
        if (!bot) continue;
        await waitTurn(g.t, earlier);
        await botPick(g, bot, target.uuid);
    }
    await waitTurn(g.t, role);
}

// 봇이 받은 그 차례 시작 알림 → 원래 마감 시각(ms) (서버와 시험이 같은 PC라 시계가 같음)
async function turnDeadline(bot, role, nightDay) {
    const started = await bot.waitForEvent('night_turn_started', { match: (p) => p.role === role && p.dayIndex === nightDay });
    return started.deadline;
}

// 허용 폭: 5초 ± 1.5초 (시험_계획 3-5 — 더 늘려서 덮지 않음)
function expectFiveSeconds(ms, what) {
    expect(ms, `${what} (ms)`).toBeGreaterThanOrEqual(3500);
    expect(ms, `${what} (ms)`).toBeLessThanOrEqual(6500);
}

// 다음 차례 안내 창(next.turn) 또는 다음 낮의 날짜 글(next.day)이 화면에 뜬 시각 — 그 직업 차례가 닫혔다는 화면 쪽 신호
async function nextShownAt(page, next, nightDay, timeout = 15_000) {
    if (next.turn) {
        await appear(page, `[data-night-turn-role="${next.turn}"]`, timeout);
        return seen(await readWatch(page), 'turn', { value: next.turn, day: dayBar(nightDay) })[0].at;
    }
    await appear(page, `[aria-label="${dayBar(next.day)}"]`, timeout);
    return seen(await readWatch(page), 'day', { value: dayBar(next.day) })[0].at;
}
const describeNext = (next) => (next.turn ? `${n.ROLE_NAMES[next.turn]} 차례 안내` : `${next.day}일 낮`);
// 화면에서 마지막으로 카드 메뉴 단추를 누른 시각
const lastPickAt = async (page) => seen(await readWatch(page), 'pick').at(-1).at;
// "[5초 뒤 마감]" 글이 읽힘 + 시간 바에 5초 표시가 붙음 + 남은 시간이 5초 이하 ("00:04" 모양)
async function expectSettleShown(page) {
    await expect(page.locator(SETTLE)).toHaveCount(1, { timeout: 4000 });
    await expect(page.getByRole('timer').first()).toHaveText(/^00:0[0-5]$/);
    await expectReadable(settleText(page), { timeout: 3000 });
}
// since(ms) 뒤로 화면에 5초 표시가 붙은 기록 (앞 차례 것과 안 섞이게 시각으로 가름)
const settleSince = async (page, since) => seen(await readWatch(page), 'settle').filter((e) => e.at >= since);

// A05-E-593~596 혼자인 직업: 고른 직후 5초 표시 → 5±1.5초 뒤 다음 차례
const SOLO = [
    { caseNo: 593, role: 'JOKER', size: 5, counts: { JOKER: 1, DOCTOR: 1 }, nightDay: 1, next: { turn: 'DOCTOR' } },
    { caseNo: 594, role: 'DOCTOR', size: 6, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, nightDay: 1, next: { turn: 'GUARD' } },
    { caseNo: 595, role: 'GUARD', size: 8, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, nightDay: 1, next: { day: 2 } },
    { caseNo: 596, role: 'WITCH_HUNTER', size: 10, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, nightDay: 2, next: { day: 3 } },
];
for (const spec of SOLO) {
    const smoke = spec.caseNo === 593 ? ' @smoke' : '';
    const when = spec.nightDay === 2 ? ' 둘째 밤' : '';
    test(`A05-E-${spec.caseNo} ${spec.size}명 판${when} ${n.ROLE_NAMES[spec.role]} 화면(혼자인 직업, 밤 30초): 고른 직후 "[5초 뒤 마감]"이 읽힘 → 5±1.5초 뒤 ${describeNext(spec.next)} @game @realtime${smoke}`, async ({ user, table }) => {
        // 10명 판은 차리는 데 오래 걸리고 앞 차례 봇 3번(15초)을 진짜로 기다림 → 이 시험만 넉넉히
        if (spec.size === 10) test.setTimeout(180_000);
        const g = await openGame(table, user, { size: spec.size, humanRole: spec.role, counts: spec.counts, night: 30 });
        await watch(g.page);
        // 내가 고를 사람 = 시민 봇 첫째, 앞 차례 봇들이 고를 사람도 같음 (광대가 노리고 의사가 지켜 아무도 안 죽음)
        const [mine, another] = g.citizens;
        let botsTarget = mine;
        if (spec.nightDay === 2) {
            // 1일 밤(보려는 밤 아님, 손잡이로 넘김): 봇 광대가 시민 봇 첫째를 죽여 둠 → 2일 밤 마녀사냥꾼인 내가 확인할 죽은 사람
            await n.toTurn(g.t, 'JOKER', { dayIndex: 1 });
            await botPick(g, g.joker, mine.uuid);
            await n.toDay(g.t, { dayIndex: 2 });
            await n.waitDead(g.t, mine.uuid);
            // 2일 낮 암살 영상이 끝난 뒤 밤으로 (영상이 밤 화면을 덮지 않게), 2일 밤 봇들은 산 시민 봇을 고름
            await passDawn(g.page);
            botsTarget = another;
        }
        await advanceToNight(g.t, spec.nightDay);
        await botsGoFirst(g, spec.role, botsTarget);
        await n.nightActUi(g.page, mine.nickname, n.ACTION_LABELS[spec.role]);
        await expectSettleShown(g.page);
        const shownAt = await nextShownAt(g.page, spec.next, spec.nightDay);
        expectFiveSeconds(shownAt - await lastPickAt(g.page), `고른 때부터 ${describeNext(spec.next)}까지`);
    });
}

// A05-E-597~600 같은 직업 봇과 둘: 한 명만 고른 동안엔 5초 없음 → 둘째가 고른 때부터 5초
const PAIRS = [
    { caseNo: 597, role: 'JOKER', size: 6, counts: { JOKER: 2, DOCTOR: 1 }, botFirst: true, next: { turn: 'DOCTOR' } },
    { caseNo: 598, role: 'JOKER', size: 6, counts: { JOKER: 2, DOCTOR: 1 }, botFirst: false, next: { turn: 'DOCTOR' } },
    { caseNo: 599, role: 'DOCTOR', size: 7, counts: { JOKER: 1, DOCTOR: 2 }, botFirst: true, next: { day: 2 } },
    { caseNo: 600, role: 'DOCTOR', size: 7, counts: { JOKER: 1, DOCTOR: 2 }, botFirst: false, next: { day: 2 } },
];
for (const spec of PAIRS) {
    const roleName = n.ROLE_NAMES[spec.role];
    test(`A05-E-${spec.caseNo} ${spec.size}명 판 ${roleName} 2명(사람 + 봇), 봇이 ${spec.botFirst ? '먼저' : '나중에'} 고름: 한 명만 고른 동안엔 5초 표시 없음 → 둘째가 고른 때부터 5±1.5초 뒤 닫힘 @game @realtime`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: spec.size, humanRole: spec.role, counts: spec.counts, night: 30 });
        await watch(g.page);
        const target = g.citizens[0];
        const [mate] = g.botsOf(spec.role);
        await advanceToNight(g.t, 1);
        await botsGoFirst(g, spec.role, target);
        const openedAt = Date.now();
        let allPickedAt = 0;
        if (spec.botFirst) {
            await botPick(g, mate, target.uuid);
            // 봇 한 명만 고른 채 진짜 2초: 5초 표시가 안 붙음
            await n.sleep(2000);
            expect(await settleSince(g.page, openedAt), '한 명만 고른 동안 5초 표시').toEqual([]);
            await n.nightActUi(g.page, target.nickname, n.ACTION_LABELS[spec.role]);
            allPickedAt = await lastPickAt(g.page);
        } else {
            await n.nightActUi(g.page, target.nickname, n.ACTION_LABELS[spec.role]);
            // 사람 한 명만 고른 채 진짜 2초: 5초 표시가 안 붙음
            await n.sleep(2000);
            expect(await settleSince(g.page, openedAt), '한 명만 고른 동안 5초 표시').toEqual([]);
            allPickedAt = Date.now();
            await botPick(g, mate, target.uuid);
        }
        await expectSettleShown(g.page);
        const shownAt = await nextShownAt(g.page, spec.next, 1);
        expectFiveSeconds(shownAt - allPickedAt, `둘째가 고른 때부터 ${describeNext(spec.next)}까지`);
    });
}

test('A05-E-601 5명 판 광대 화면(밤 30초): 남은 3초에 고르면 5초 표시 없이 원래 마감에 닫힘 @game @realtime', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 5, humanRole: 'JOKER', counts: { JOKER: 1 }, night: 30 });
    await watch(g.page);
    const target = g.citizens[0];
    await advanceToNight(g.t, 1);
    const deadline = await turnDeadline(g.citizenBots[0], 'JOKER', 1);
    // 마감 6초 전에 카드 메뉴를 열어 두고, 남은 3초가 되는 때 누름 (진짜 시간 규칙이라 시각까지 그대로 기다림)
    await n.sleep(Math.max(0, deadline - 6000 - Date.now()));
    const menu = await n.openCardMenu(g.page, target.nickname);
    await n.sleep(Math.max(0, deadline - 3000 - Date.now()));
    // PC 읽기 이름은 "닉네임 암살" → 이름 끝이 '암살'인 단추로 찾음
    await n.nightMenuItem(menu, '암살').click();
    const closedAt = await nextShownAt(g.page, { day: 2 }, 1, 10_000);
    const log = await readWatch(g.page);
    const pickedAt = seen(log, 'pick').at(-1).at;
    // 준비 확인: 누른 때 남은 시간이 5초보다 짧았음 (3초 ± 1.5초)
    expect(deadline - pickedAt, '누른 때 남은 시간 (ms)').toBeGreaterThanOrEqual(1500);
    expect(deadline - pickedAt, '누른 때 남은 시간 (ms)').toBeLessThanOrEqual(4500);
    expect(seen(log, 'settle'), '5초 표시').toEqual([]);
    // 원래 마감(±1.5초)에 닫힘 — 고른 때부터 5초로 늘어나지 않음
    expect(Math.abs(closedAt - deadline), '닫힌 때와 원래 마감의 차이 (ms)').toBeLessThanOrEqual(1500);
});

test('A05-E-602 6명 판 광대 화면: A를 고르고 2초째 B로 바꾸면 낮 연출 글에 B 닉네임 @game @realtime', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6, humanRole: 'JOKER', counts: { JOKER: 1 }, night: 30 });
    await watch(g.page);
    const [a, b] = g.citizens;
    await advanceToNight(g.t, 1);
    await waitTurn(g.t, 'JOKER');
    await n.nightActUi(g.page, a.nickname, '암살');
    await n.sleep(2000);
    await n.nightActUi(g.page, b.nickname, '암살');
    await appear(g.page, KILL, 15_000);
    await expectReadable(g.page.locator(KILL_MESSAGE), { timeout: 3000 });
    const log = await readWatch(g.page);
    const picks = seen(log, 'pick').map((e) => e.at);
    // 준비 확인: 두 번째 누름이 5초 안이었음
    expect(picks).toHaveLength(2);
    expect(picks[1] - picks[0], '바꾼 때 (ms)').toBeLessThan(5000);
    expect(seen(log, 'message').map((e) => e.value)).toEqual([killedText(b.nickname)]);
    await n.expectCard(g.page, a.nickname, 'alive');
});

test('A05-E-603 6명 판 광대 화면: A를 고르고 3초째 B로 바꿔도 처음 고른 때부터 5±1.5초에 닫힘 @game @realtime', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6, humanRole: 'JOKER', counts: { JOKER: 1, DOCTOR: 1 }, night: 30 });
    await watch(g.page);
    const [a, b] = g.citizens;
    await advanceToNight(g.t, 1);
    await waitTurn(g.t, 'JOKER');
    await n.nightActUi(g.page, a.nickname, '암살');
    await n.sleep(3000);
    await n.nightActUi(g.page, b.nickname, '암살');
    const shownAt = await nextShownAt(g.page, { turn: 'DOCTOR' }, 1);
    const picks = seen(await readWatch(g.page), 'pick').map((e) => e.at);
    // 준비 확인: 두 번째 누름이 5초 안이었음
    expect(picks).toHaveLength(2);
    expect(picks[1] - picks[0], '바꾼 때 (ms)').toBeLessThan(5000);
    expectFiveSeconds(shownAt - picks[0], '처음 고른 때부터 의사 차례 안내까지');
});

test('A05-E-604 [임시 7] 8명 판 광대 2명: 내가 고른 뒤 봇 동료 광대가 나가면 그때부터 5±1.5초 뒤 닫힘 @game @realtime', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 8, humanRole: 'JOKER', counts: { JOKER: 2 }, night: 30 });
    await watch(g.page);
    const target = g.citizens[0];
    const [mate] = g.botsOf('JOKER');
    await advanceToNight(g.t, 1);
    await waitTurn(g.t, 'JOKER');
    await n.nightActUi(g.page, target.nickname, '암살');
    // 나만 고른 채 진짜 2초: 5초 표시가 안 붙음
    await n.sleep(2000);
    expect(seen(await readWatch(g.page), 'settle'), '나만 고른 동안 5초 표시').toEqual([]);
    const leftAt = Date.now();
    const left = await mate.request('leave_game_session', { gameId: g.t.gameId });
    expect(left?.ok, `동료 나가기 (${left?.code ?? '답 없음'})`).toBe(true);
    await expectSettleShown(g.page);
    const shownAt = await nextShownAt(g.page, { day: 2 }, 1);
    expectFiveSeconds(shownAt - leftAt, '동료가 나간 때부터 2일 낮까지');
});

test('A05-E-605 6명 판 시민 화면: 봇 광대가 고르면 내 화면에도 "[5초 뒤 마감]"이 읽힘 @game @realtime', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6, night: 30 });
    await watch(g.page);
    await advanceToNight(g.t, 1);
    await waitTurn(g.t, 'JOKER');
    // 밤 차례 안내 창(2.6초 뒤 스스로 닫힘)이 시간 바를 덮음 → 닫힌 뒤에 봇이 고르게
    await g.page.waitForFunction(() => (window.__a05bWatch ?? []).some((e) => e.what === 'turn' && e.value === 'JOKER'), null, { timeout: 15_000 });
    await n.closeNotices(g.page, { names: ['밤 역할 안내'] });
    await expect(g.page.locator('[data-night-turn-role]')).toHaveCount(0);
    await botPick(g, g.joker, g.citizens[0].uuid);
    await expectSettleShown(g.page);
});

test('A05-E-606 7명 판 처형된 관전자 화면: 봇 광대가 고르면 내 화면에도 "[5초 뒤 마감]"이 읽힘 @game @realtime', async ({ user, table }) => {
    // 밤 60초 방: 처형 뒤 추방 연출·"관전 계속하기"까지 화면에서 닫는 동안 광대 차례가 저절로 안 끝나게
    const g = await openGame(table, user, { size: 7, night: 60 });
    await watch(g.page);
    // 1일 낮 처형(손잡이로 빨리)은 보려는 밤 앞 단계 → 처형되자마자 1일 밤 광대 차례가 진짜 시간으로 열림
    await getExecuted(g);
    // 준비 확인: 창을 닫는 동안 광대 차례가 끝나 버리지 않았음 (남은 시간이 6초 넘게)
    const deadline = await turnDeadline(g.citizenBots[0], 'JOKER', 1);
    expect(deadline - Date.now(), '광대 차례 남은 시간 (준비, ms)').toBeGreaterThan(6000);
    await botPick(g, g.joker, g.citizens[0].uuid);
    await expectSettleShown(g.page);
});

test('A05-E-607 7명 판 광대 2명: 봇 동료 광대가 끊겨 있으면 내가 골라도 5초 표시 없이 원래 마감(30초)에 닫힘 @game @realtime', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 7, humanRole: 'JOKER', counts: { JOKER: 2 }, night: 30 });
    await watch(g.page);
    const target = g.citizens[0];
    const [mate] = g.botsOf('JOKER');
    await advanceToNight(g.t, 1);
    const deadline = await turnDeadline(g.citizenBots[0], 'JOKER', 1);
    // 차례가 열린 뒤에 끊음 (끊김 60초 기다림이 차례 마감 30초보다 뒤에 끝나게 → 차례 동안 계속 "끊긴 채")
    mate.socket.disconnect();
    await n.expectCard(g.page, mate.nickname, 'disconnected');
    await n.nightActUi(g.page, target.nickname, '암살');
    const closedAt = await nextShownAt(g.page, { day: 2 }, 1, 45_000);
    const log = await readWatch(g.page);
    expect(seen(log, 'settle'), '5초 표시').toEqual([]);
    expect(Math.abs(closedAt - deadline), '닫힌 때와 원래 마감의 차이 (ms)').toBeLessThanOrEqual(1500);
    // 고른 때부터 5초에 닫힌 게 아님
    expect(closedAt - seen(log, 'pick').at(-1).at, '고른 때부터 닫힐 때까지 (ms)').toBeGreaterThan(6500);
});

for (const [caseNo, night] of [[608, 60], [609, 120]]) {
    test(`A05-E-${caseNo} 6명 판 광대 화면(밤 ${night}초 방): 차례가 열리자마자 고르면 5±1.5초 뒤 닫힘 @game @realtime`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: 6, humanRole: 'JOKER', counts: { JOKER: 1, DOCTOR: 1 }, night });
        await watch(g.page);
        await advanceToNight(g.t, 1);
        await waitTurn(g.t, 'JOKER');
        await n.nightActUi(g.page, g.citizens[0].nickname, '암살');
        await expectSettleShown(g.page);
        const shownAt = await nextShownAt(g.page, { turn: 'DOCTOR' }, 1);
        expectFiveSeconds(shownAt - await lastPickAt(g.page), '고른 때부터 의사 차례 안내까지');
    });
}

const SECOND_NIGHT = [
    { caseNo: 610, role: 'JOKER', next: { turn: 'DOCTOR' } },
    { caseNo: 611, role: 'DOCTOR', next: { day: 3 } },
];
for (const spec of SECOND_NIGHT) {
    test(`A05-E-${spec.caseNo} 7명 판 ${n.ROLE_NAMES[spec.role]} 화면: 2일 밤에도 고른 때부터 5±1.5초 뒤 닫힘 @game @realtime`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: 7, humanRole: spec.role, night: 30 });
        await watch(g.page);
        const target = g.citizens[0];
        // 1일 밤은 아무도 안 고르고 손잡이로 넘김 (보려는 밤 아님) → 2일 밤부터 손잡이 없음
        await advanceToNight(g.t, 2);
        await botsGoFirst(g, spec.role, target);
        await n.nightActUi(g.page, target.nickname, n.ACTION_LABELS[spec.role]);
        await expectSettleShown(g.page);
        const shownAt = await nextShownAt(g.page, spec.next, 2);
        expectFiveSeconds(shownAt - await lastPickAt(g.page), `고른 때부터 ${describeNext(spec.next)}까지`);
    });
}

test('A05-E-612 6명 판 광대 화면: 고르고 1초 뒤 새로고침 → 남은 시간이 5초 이하로 보이고 원래 마감(30초)까지 안 감 @game @realtime', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6, humanRole: 'JOKER', counts: { JOKER: 1, DOCTOR: 1 }, night: 30 });
    // 새로고침한 새 문서에서도 지켜봄 + 남은 시간 글도 적음 (접힌 시간 바는 펼쳐 둠)
    await watch(g.page, { reload: true, timer: true });
    await advanceToNight(g.t, 1);
    await waitTurn(g.t, 'JOKER');
    await n.nightActUi(g.page, g.citizens[0].nickname, '암살');
    const pickedAt = await lastPickAt(g.page);
    await n.sleep(1000);
    await g.page.reload();
    // 광대 차례가 닫힌 것을 화면에서: 의사 차례 안내 창 또는 상태 글이 "[밤-의사]"로 바뀜 (새로고침이 늦어 차례가 이미 넘어갔으면 안내 창은 안 뜸)
    await g.page.waitForFunction(
        () => (window.__a05bWatch ?? []).some((e) => (e.what === 'turn' && e.value === 'DOCTOR') || (e.what === 'timer' && e.value.startsWith('[밤-의사]|'))),
        null, { timeout: 15_000 });
    const log = await readWatch(g.page);
    const closedAt = log.find((e) => (e.what === 'turn' && e.value === 'DOCTOR') || (e.what === 'timer' && e.value.startsWith('[밤-의사]|'))).at;
    expectFiveSeconds(closedAt - pickedAt, '고른 때부터 광대 차례가 닫힐 때까지');
    // 새로고침 뒤 광대 차례 동안 화면에 보인 남은 시간: 한 번은 보였고 전부 5초 이하 ("[밤-광대]|00:03" → 3)
    const shown = seen(log, 'timer')
        .filter((e) => e.at < closedAt && !e.value.startsWith('[밤-의사]|'))
        .map((e) => e.value.split('|')[1])
        .map((clock) => Number(clock.split(':')[0]) * 60 + Number(clock.split(':')[1]));
    expect(shown.length, '새로고침 뒤 광대 차례 남은 시간이 보인 횟수').toBeGreaterThan(0);
    for (const seconds of shown) expect(seconds, '새로고침 뒤 남은 시간(초)').toBeLessThanOrEqual(5);
});

for (const [caseNo, width, height] of [[613, 1280, 720], [614, 1920, 1080]]) {
    test(`A05-E-${caseNo} 5명 판 광대 화면 창 ${width}×${height}: 고른 직후 "[5초 뒤 마감]"이 읽힘 @game @realtime`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: 5, humanRole: 'JOKER', counts: { JOKER: 1, DOCTOR: 1 }, night: 30 });
        // 창 크기는 판을 차린 뒤에 바꿈 (차리는 동안 사람 창이 새로 열릴 수 있음)
        await g.page.setViewportSize({ width, height });
        await watch(g.page);
        await advanceToNight(g.t, 1);
        await waitTurn(g.t, 'JOKER');
        await n.nightActUi(g.page, g.citizens[0].nickname, '암살');
        await expectSettleShown(g.page);
    });
}
