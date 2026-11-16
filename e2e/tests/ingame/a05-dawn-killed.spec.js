'use strict';

// 낮이 될 때 모두가 보는 암살 영상 + "지난밤 ○○님이 살해당했습니다" 브라우저 시험 (받은 버그 5: 영상이 광대와 당한 사람에게만 뜨던 것), PC 사람 1명 + 봇
// 목록 A05b-밤-알림-낮연출.md A05-E-501~522·579~581·583~585·588~590·592 (32개) — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-dawn-killed.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');

// ---- 이 파일 안 도우미 (공용 도우미는 못 고쳐서 A05b 브라우저 시험 파일마다 같은 모양으로 둠) ----

// 화면에서 찾는 표시·글 (frontend/src/domains/game/ingame 코드에서 확인한 것)
const KILL = '[data-ingame-night-success-kill]';
const KILL_MESSAGE = '[data-ingame-dawn-report-message]';
const SAVED = '[data-ingame-dawn-report="SAVED"]';
const DAWN_ANY = '[data-ingame-night-success-kill], [data-ingame-dawn-report]';
const DAY_ENTRANCE = '[data-ingame-phase-entrance="DAY"]';
const SAVED_TEXT = '지난밤 의사가 공격받은 사람을 살려냈습니다';
const DAY_TEXT = '낮이 되었습니다';
const WAIT_TEXT = '진행을 기다리는 중입니다.';
const ROLE_WORDS = /광대|시민|의사|경비원|마녀사냥꾼/;
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


// ---- 이 파일 시험 ----

// 보는 사람 자리 (목록 차례 그대로): 처음부터 관전자인 자리는 1일 낮에 처형당해 둠
const SEATS = [
    { key: 'citizen', label: '산 시민', role: 'CITIZEN' },
    { key: 'joker', label: '광대', role: 'JOKER' },
    { key: 'victim', label: '당한 사람', role: 'CITIZEN' },
    { key: 'spectator', label: '전날 죽은 관전자', role: 'CITIZEN' },
    { key: 'doctor', label: '의사', role: 'DOCTOR' },
];
const seatOf = (key) => SEATS.find((seat) => seat.key === key);
// 의사 자리인데 그 인원 구성에 의사가 없으면(5명) 의사 1을 더함
const countsFor = (size, role) => (role === 'DOCTOR' && !COUNTS[size].DOCTOR ? { ...COUNTS[size], DOCTOR: 1 } : COUNTS[size]);

// 밤 한 번: 광대가 victim을 고르고(사람이 광대면 화면으로) 다음 낮까지 넘김 — 넘기는 동안 암살 영상이 붙는 순간을 같이 기다림
async function killAndDawn(g, victim, nightDay) {
    await n.toTurn(g.t, 'JOKER', { dayIndex: nightDay });
    if (g.joker) await botPick(g, g.joker, victim.uuid);
    else await n.nightActUi(g.page, victim.nickname, '암살');
    await Promise.all([n.toDay(g.t, { dayIndex: nightDay + 1 }), appear(g.page, KILL)]);
}

// 낮 시작 연출 확인: 영상 위 글이 읽히고(크기·화면 안·안 가려짐·대비), 글자 그대로이고, 직업 이름이 없고,
// 영상은 그 낮에 딱 한 번 뜸(= 밤 동안엔 한 번도 안 뜸), 옛 "기다리는 중" 창도 없음
async function expectKilledShown(page, victim, day) {
    await expectReadable(page.locator(KILL_MESSAGE), { timeout: 3000 });
    const log = await readWatch(page);
    expect(seen(log, 'kill').map((e) => e.day), '암살 영상이 뜬 때').toEqual([dayBar(day)]);
    const texts = seen(log, 'message').map((e) => e.value);
    expect(texts).toEqual([killedText(victim.nickname)]);
    expect(texts.join(' ')).not.toMatch(ROLE_WORDS);
    expect(seen(log, 'wait'), `"${WAIT_TEXT}" 창`).toEqual([]);
}

let no = 500;
for (const seat of SEATS) {
    for (const size of [5, 7, 8, 10]) {
        no += 1;
        const smoke = no === 501 ? ' @smoke' : '';
        test(`A05-E-${no} [버그 5] ${size}명 판 ${seat.label} 화면: 밤엔 영상 없음 → 낮이 될 때 암살 영상 + "지난밤 ○○님이 살해당했습니다"가 읽힘, 글에 직업 없음 @game${smoke}`, async ({ user, table }) => {
            // 10명 판은 차리고 넘기는 데 오래 걸림 → 이 시험만 넉넉히 (설정은 안 바꿈)
            if (size === 10) test.setTimeout(180_000);
            const g = await openGame(table, user, { size, humanRole: seat.role, counts: countsFor(size, seat.role) });
            await watch(g.page);
            if (seat.key === 'spectator') await getExecuted(g);
            const victim = seat.key === 'victim' ? g.me : g.citizens[0];
            await killAndDawn(g, victim, 1);
            await expectKilledShown(g.page, victim, 2);
        });
    }
}

for (const [caseNo, seat] of [[521, seatOf('citizen')], [522, seatOf('joker')]]) {
    test(`A05-E-${caseNo} 7명 판 ${seat.label} 화면: 2일 밤 암살 → 3일 낮에 암살 영상 + 글 @game`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: 7, humanRole: seat.role });
        await watch(g.page);
        // 1일 밤은 아무도 안 고름 → 2일 낮 (연출 없음)
        await n.toDay(g.t, { dayIndex: 2 });
        const victim = g.citizens[0];
        await killAndDawn(g, victim, 2);
        await expectKilledShown(g.page, victim, 3);
    });
}

test('A05-E-579 7명 판 죽음: 암살 영상이 먼저, 영상이 닫힌 뒤에야 "낮이 되었습니다" @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 7 });
    // 2일 낮 안내 창은 스스로 안 닫음 (뜨는 차례를 직접 봄)
    await watch(g.page, { confirmBeforeDay: 2 });
    await killAndDawn(g, g.citizens[0], 1);
    // 영상이 도는 동안엔 낮 안내 창이 없음
    await expect(g.page.locator(DAY_ENTRANCE)).toHaveCount(0);
    await expect(g.page.locator(KILL)).toHaveCount(0, { timeout: 12_000 });
    await expectReadable(g.page.locator(DAY_ENTRANCE).getByText(DAY_TEXT), { timeout: 5000 });
    const order = (await readWatch(g.page))
        .filter((e) => e.day === dayBar(2) && ['kill', 'kill:off', 'entrance'].includes(e.what))
        .map((e) => e.what);
    expect(order).toEqual(['kill', 'kill:off', 'entrance']);
});

test('A05-E-580 7명 판 살림: "의사가 살려냈습니다" 창이 먼저, 확인으로 닫은 뒤에야 "낮이 되었습니다" @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 7 });
    await watch(g.page, { confirmBeforeDay: 2 });
    const target = g.citizens[0];
    // 봇 광대가 A를 노리고 봇 의사가 A를 지킴
    await n.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await botPick(g, g.joker, target.uuid);
    await n.toTurn(g.t, 'DOCTOR', { dayIndex: 1 });
    await botPick(g, g.doctor, target.uuid);
    await Promise.all([n.toDay(g.t, { dayIndex: 2 }), appear(g.page, SAVED)]);
    const saved = g.page.locator(SAVED);
    await expectReadable(saved.getByText(SAVED_TEXT, { exact: true }), { timeout: 5000 });
    // 살림 창이 떠 있는 동안엔 낮 안내 창이 없음
    await expect(g.page.locator(DAY_ENTRANCE)).toHaveCount(0);
    await saved.getByRole('button', { name: '확인', exact: true }).click();
    await expect(saved).toHaveCount(0);
    await expectReadable(g.page.locator(DAY_ENTRANCE).getByText(DAY_TEXT), { timeout: 5000 });
    const order = (await readWatch(g.page))
        .filter((e) => e.day === dayBar(2) && ['report', 'report:off', 'entrance'].includes(e.what))
        .map((e) => e.what);
    expect(order).toEqual(['report', 'report:off', 'entrance']);
});

test('A05-E-581 7명 판 아무 일 없음: 연출 없이 바로 "낮이 되었습니다" @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 7 });
    await watch(g.page, { confirmBeforeDay: 2 });
    // 밤까지 간 뒤에 기다림을 걺 (1일 낮 안내 창을 2일 것으로 잘못 잡지 않게), 밤엔 아무도 안 고름
    await n.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await Promise.all([n.toDay(g.t, { dayIndex: 2 }), appear(g.page, DAY_ENTRANCE)]);
    await expectReadable(g.page.locator(DAY_ENTRANCE).getByText(DAY_TEXT), { timeout: 5000 });
    const log = await readWatch(g.page);
    expect(seen(log, 'kill')).toEqual([]);
    expect(seen(log, 'report')).toEqual([]);
    expect(seen(log, 'entrance', { value: 'DAY', day: dayBar(2) })).toHaveLength(1);
});

for (const [caseNo, seat] of [[583, seatOf('citizen')], [584, seatOf('spectator')], [585, seatOf('doctor')]]) {
    const label = seat.key === 'spectator' ? '죽은 관전자' : seat.label;
    test(`A05-E-${caseNo} 7명 판 ${label} 화면: 죽은 A 카드는 "사망"만, 직업 이름은 안 보임 @game`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: 7, humanRole: seat.role });
        await watch(g.page);
        if (seat.key === 'spectator') await getExecuted(g);
        const victim = g.citizens[0];
        await killAndDawn(g, victim, 1);
        // 영상이 닫힌 뒤 판의 카드를 봄
        await expect(g.page.locator(KILL)).toHaveCount(0, { timeout: 12_000 });
        await n.expectCard(g.page, victim.nickname, 'dead');
        const card = n.cardButton(g.page, victim.nickname);
        await expectReadable(card, { contrast: false });
        // 카드 글: 화면 읽기용 "사망" + 닉네임뿐 (직업 이름 없음)
        const text = await card.evaluate((el) => el.textContent);
        expect(text).toContain('사망');
        expect(text).not.toMatch(ROLE_WORDS);
    });
}

for (const [caseNo, width, height] of [[588, 1280, 720], [589, 1920, 1080]]) {
    test(`A05-E-${caseNo} 6명 판 창 ${width}×${height}: 암살 영상 위 글이 읽힘 @game`, async ({ user, table }) => {
        const g = await openGame(table, user, { size: 6 });
        // 창 크기는 판을 차린 뒤에 바꿈 (차리는 동안 사람 창이 새로 열릴 수 있음)
        await g.page.setViewportSize({ width, height });
        await watch(g.page);
        const victim = g.citizens[0];
        await killAndDawn(g, victim, 1);
        await expectKilledShown(g.page, victim, 2);
    });
}

test('A05-E-590 6명 판: 암살 영상이 도는 동안 글이 시작 직후에도 끝나기 직전에도 읽힘 @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6 });
    await watch(g.page);
    await killAndDawn(g, g.citizens[0], 1);
    const message = g.page.locator(KILL_MESSAGE);
    await expectReadable(message, { timeout: 3000 });
    // 영상 시계로 끝나기 1.5초 전까지 기다림 (영상 길이는 파일마다 달라 고정 시간으로 안 기다림)
    await g.page.waitForFunction(() => {
        const video = document.querySelector('video[data-ingame-night-success-source-video]');
        return video !== null && video.duration > 0 && video.duration - video.currentTime <= 1.5;
    }, null, { polling: 100, timeout: 10_000 });
    await expectReadable(message, { timeout: 1200 });
});

test('A05-E-592 6명 판: 암살 영상은 끝나면 스스로 닫히고 "낮이 되었습니다"가 뜸 @game', async ({ user, table }) => {
    const g = await openGame(table, user, { size: 6 });
    await watch(g.page, { confirmBeforeDay: 2 });
    await killAndDawn(g, g.citizens[0], 1);
    await expect(g.page.locator(KILL_MESSAGE)).toBeVisible();
    // 아무것도 안 누르고 기다림: 12초가 지나면 "건너뛰기"가 뜨는 것이라 그 전에 스스로 닫혀야 함
    await expect(g.page.locator(KILL)).toHaveCount(0, { timeout: 11_000 });
    await expect(g.page.locator(DAWN_ANY)).toHaveCount(0);
    await expectReadable(g.page.locator(DAY_ENTRANCE).getByText(DAY_TEXT), { timeout: 5000 });
});
