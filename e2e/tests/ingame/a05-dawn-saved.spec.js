'use strict';

// 의사가 살렸을 때 낮에 모두가 보는 "지난밤 아무 일도 일어나지 않았습니다" 창 브라우저 시험 (의사가 살린 것도 누가 공격받았는지도 안 밝힘 — 아무도 안 죽은 밤과 같은 창, 사용자 결정 2026-11-18), PC 사람 1명 + 봇
// 목록 A05b-밤-알림-낮연출.md A05-E-523~540·586~587·591 (21개) — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-dawn-saved.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');

// ---- 이 파일 안 도우미 (공용 도우미는 못 고쳐서 A05b 브라우저 시험 파일마다 같은 모양으로 둠) ----

// 화면에서 찾는 표시·글 (frontend/src/domains/game/ingame 코드에서 확인한 것)
const KILL = '[data-ingame-night-success-kill]';
// 아무도 안 죽은 밤 글 창 (의사가 살렸든 광대가 안 죽였든 같은 종류 QUIET)
const SAVED = '[data-ingame-dawn-report="QUIET"]';
const DAWN_ANY = '[data-ingame-night-success-kill], [data-ingame-dawn-report]';
const DAY_ENTRANCE = '[data-ingame-phase-entrance="DAY"]';
const PRIVATE_RESULT = '[data-ingame-night-private-result]';
const SAVED_TEXT = '지난밤 아무 일도 일어나지 않았습니다';
const WAIT_TEXT = '진행을 기다리는 중입니다.';
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

// 보는 사람 자리 (목록 차례 그대로)
const SEATS = [
    { key: 'citizen', label: '산 시민', role: 'CITIZEN' },
    { key: 'joker', label: '광대', role: 'JOKER' },
    { key: 'saved', label: '보호받은 사람', role: 'CITIZEN' },
    { key: 'doctor', label: '의사', role: 'DOCTOR' },
    { key: 'spectator', label: '죽은 관전자', role: 'CITIZEN' },
];
const seatOf = (key) => SEATS.find((seat) => seat.key === key);

// 밤 한 번: 광대와 의사가 둘 다 target을 고르고(사람이 그 직업이면 화면으로) 다음 낮까지 넘김 — 넘기는 동안 살림 창이 붙는 순간을 같이 기다림
async function saveAndDawn(g, target, nightDay) {
    await n.toTurn(g.t, 'JOKER', { dayIndex: nightDay });
    if (g.joker) await botPick(g, g.joker, target.uuid);
    else await n.nightActUi(g.page, target.nickname, '암살');
    await n.toTurn(g.t, 'DOCTOR', { dayIndex: nightDay });
    if (g.doctor) await botPick(g, g.doctor, target.uuid);
    else await n.nightActUi(g.page, target.nickname, '보호');
    await Promise.all([n.toDay(g.t, { dayIndex: nightDay + 1 }), appear(g.page, SAVED)]);
}

// 살림 창 확인: 글이 읽히고(크기·화면 안·안 가려짐·대비), 정한 한 줄 그대로이고, 창 어디에도 판 사람 닉네임이 없음
async function expectSavedDialog(g) {
    const dialog = g.page.locator(SAVED);
    const message = dialog.locator('p');
    await expectReadable(message, { timeout: 5000 });
    await expect(message).toHaveText(SAVED_TEXT);
    const shown = await dialog.evaluate((el) => el.textContent);
    for (const player of g.players) expect(shown, '살림 창 글').not.toContain(player.nickname);
}

// 그 밤·낮 내내 화면 기록: 살림 창은 days의 낮마다 한 번씩만, 암살 영상·영상 위 글은 한 번도 없음
async function expectOnlySaved(page, days) {
    const log = await readWatch(page);
    expect(seen(log, 'report').map((e) => `${e.value} ${e.day}`)).toEqual(days.map((day) => `QUIET ${dayBar(day)}`));
    expect(seen(log, 'kill')).toEqual([]);
    expect(seen(log, 'message')).toEqual([]);
}

let no = 522;
for (const seat of SEATS) {
    for (const size of [6, 8, 10]) {
        no += 1;
        const smoke = no === 523 ? ' @smoke' : '';
        test(`A05-E-${no} ${size}명 판 ${seat.label} 화면: 낮이 될 때 "지난밤 아무 일도 일어나지 않았습니다"가 읽힘, 보호받은 사람 이름·표시 없음 @game${smoke}`, async ({ user, table }) => {
            // 10명 판은 차리고 넘기는 데 오래 걸림 → 이 시험만 넉넉히 (설정은 안 바꿈)
            if (size === 10) test.setTimeout(180_000);
            const g = await openGame(table, user, { size, humanRole: seat.role });
            await watch(g.page);
            if (seat.key === 'spectator') await getExecuted(g);
            const target = seat.key === 'saved' ? g.me : g.citizens[0];
            await saveAndDawn(g, target, 1);
            await expectSavedDialog(g);
            await expectOnlySaved(g.page, [2]);
            // 보호받은 사람 카드는 그대로 산 사람
            await n.expectCard(g.page, target.nickname, 'alive');
        });
    }
}

test('A05-E-538 7명 판 시민 화면: 2일 밤 의사가 광대 대상을 지킴 → 3일 낮에 아무 일 글 @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 7 });
    await watch(g.page);
    // 1일 밤은 아무도 안 고름 → 2일 낮도 같은 "아무 일도" 글 창 (의사가 살린 밤과 구별 안 됨)
    await Promise.all([n.toDay(g.t, { dayIndex: 2 }), appear(g.page, SAVED)]);
    await expectSavedDialog(g);
    await passDawn(g.page);
    await saveAndDawn(g, g.citizens[0], 2);
    await expectSavedDialog(g);
    await expectOnlySaved(g.page, [2, 3]);
});

test('A05-E-539 6명 판 의사 화면: 광대가 나를 노리고 내가 나를 지킴 → 밤 동안엔 아무 표시 없고 낮에 아무 일 글 @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6, humanRole: 'DOCTOR' });
    await watch(g.page);
    await n.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await botPick(g, g.joker, g.me.uuid);
    await n.toTurn(g.t, 'DOCTOR', { dayIndex: 1 });
    // 광대 차례가 끝나 내 차례가 됐어도 내 화면엔 찍혔다는 표시가 없음 (영상·기다림 창·결과 창·낮 시작 글 창)
    await n.openCardMenu(g.page, g.me.nickname);
    const night = await readWatch(g.page);
    for (const what of ['kill', 'report', 'wait', 'private']) expect(seen(night, what), `밤 동안 ${what}`).toEqual([]);
    await n.nightActUi(g.page, g.me.nickname, '보호');
    await Promise.all([n.toDay(g.t, { dayIndex: 2 }), appear(g.page, SAVED)]);
    await expectSavedDialog(g);
    await expectOnlySaved(g.page, [2]);
    await n.expectCard(g.page, g.me.nickname, 'alive');
});

test('A05-E-540 8명 판 의사 화면: 1·2일 밤 광대와 내가 둘 다 A → 2일 낮도 3일 낮도 아무 일 글 @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 8, humanRole: 'DOCTOR' });
    await watch(g.page);
    const target = g.citizens[0];
    await saveAndDawn(g, target, 1);
    await expectSavedDialog(g);
    await passDawn(g.page);
    await saveAndDawn(g, target, 2);
    await expectSavedDialog(g);
    await expectOnlySaved(g.page, [2, 3]);
    await n.expectCard(g.page, target.nickname, 'alive');
});

// 카드 겉모습: 상태 값·닉네임 말고 붙은 글·안에 든 요소 차림 (표시가 하나 더 붙으면 달라짐)
const cardLook = (page, nickname) => n.cardButton(page, nickname).locator('[data-ingame-player-nickname]').evaluate((el) => ({
    status: el.getAttribute('data-ingame-player-status'),
    extraText: el.textContent.replace(el.getAttribute('data-ingame-player-nickname'), '').trim(),
    tags: [...el.querySelectorAll('*')].map((node) => node.tagName).join(' '),
}));

for (const [caseNo, seat] of [[586, seatOf('citizen')], [587, seatOf('joker')]]) {
    test(`A05-E-${caseNo} 8명 판 ${seat.label} 화면: 살림 뒤 보호받은 사람 카드가 다른 산 사람 카드와 같은 모양 @game`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: 8, humanRole: seat.role });
        await watch(g.page);
        const [target, other] = g.citizens;
        await saveAndDawn(g, target, 1);
        await expectSavedDialog(g);
        await passDawn(g.page);
        // 광대 화면엔 아무 일 창 뒤에 내게만 오는 "암살 실패" 창이 뜸 → 닫아야 판이 보임
        if (seat.key === 'joker') {
            const result = g.page.locator(PRIVATE_RESULT);
            await result.getByRole('button', { name: '확인', exact: true }).click();
            await expect(result).toHaveCount(0);
        }
        // 낮 안내 창까지 닫힌 뒤(지켜보기가 스스로 확인) 카드를 봄
        await expect(g.page.locator(DAY_ENTRANCE)).toHaveCount(0);
        await expectReadable(n.cardButton(g.page, target.nickname), { contrast: false });
        const look = await cardLook(g.page, target.nickname);
        expect(look.status).toBe('alive');
        expect(look.extraText).toBe('');
        expect(look).toEqual(await cardLook(g.page, other.nickname));
    });
}

test('A05-E-591 6명 판: 아무 일 글 창의 "확인" 단추가 읽히고 누르면 창이 닫힘 @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6 });
    await watch(g.page);
    await saveAndDawn(g, g.citizens[0], 1);
    const dialog = g.page.locator(SAVED);
    const confirm = dialog.getByRole('button', { name: '확인', exact: true });
    await expectReadable(confirm, { timeout: 5000 });
    // 스스로 닫히지 않음: 누르기 전까지 떠 있음
    await expect(dialog).toHaveCount(1);
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(g.page.locator(DAWN_ANY)).toHaveCount(0);
});
