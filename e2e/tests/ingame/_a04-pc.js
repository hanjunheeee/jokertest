'use strict';

// 재판(A04) PC 브라우저 시험 도우미 파일, 판 차리기(직업 전부 고정)·재판까지 가기·재판 창 고르개·"읽힘" 확인·화면 기록·화면 소켓 손대기
// tests/ingame/a04-*.spec.js(간단, PC)만 씀 — 공용 도우미(helpers·a-day·b-night)는 불러 쓰기만 하고 안 고침
const { expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const day = require('./a-day/_lib');
const night = require('./b-night/_night');

// 화면 글 (frontend constants/actions/ingameActionPanel.js·utils/voteSubmitPatch.js·ingameTribunalExpulsionPresentation.js 그대로)
const TEXT = Object.freeze({
    GUILTY: '유죄',
    NOT_GUILTY: '무죄',
    DEFENDANT: '당신은 피고인입니다. 투표할 수 없습니다.',
    DEAD: '사망한 참가자는 투표할 수 없습니다.',
    DONE: '투표가 완료되었습니다.',
    SETTLE: '[5초 뒤 마감]',
    TRIBUNAL_BAR: '[재판-진행 중]',
    NIGHT: '밤이 되었습니다',
    DAY: '낮이 되었습니다',
    STALE_DAY: '지난 재판이라 투표할 수 없습니다.',
    expel: (nickname) => `[${nickname}]님이 가면무도회에서 추방당하셨습니다.`,
});

// 시험이 화면을 보는 동안 단계가 저절로 안 넘어가게 길게 둠 (넘기기는 손잡이로, 진짜 시간 케이스만 재판 15초로 덮어씀)
const LONG_TIMES = Object.freeze({ dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 });

const uuidOf = (x) => x.account.uuid;
const nickOf = (x) => x.account.nickname;

/** 진짜 시각 ts(ms)까지 기다림 (이미 지났으면 바로) — 진짜 시간 규칙 케이스만 씀 */
async function sleepUntil(ts) {
    const ms = ts - Date.now();
    if (ms > 0) await sleep(ms);
}

/** 남은 시간 자리를 시간 바로 고정 (개발 서버로 띄우면 기본이 채팅 틀이라 재판 중엔 남은 시간이 안 보임) */
async function pinTimebar(page) {
    await page.evaluate(() => {
        try { window.localStorage.setItem('joker.ingame.timerPlacement', 'timebar'); } catch { /* 저장 막힘 */ }
    });
}

/**
 * 판 차리기: 사람 1(+ others) + 봇, 직업 전부 정함 (직접 구성 — 안 적은 봇은 시민, 특수 직업은 적은 만큼만)
 * 서버 직업을 읽어 사람 직업을 확인하고 봇 순서를 bots 순서대로 맞춤 (b-night setup) → t.bots[i]가 bots[i] 직업
 * @param {object} o
 * @param {number} o.n 판 인원 5~10
 * @param {string} [o.me='CITIZEN'] 사람 직업
 * @param {string[]} [o.bots=['JOKER']] 봇 직업 (앞에서부터)
 * @param {object[]} [o.others=[]] 더 앉힐 브라우저 사람 (모두 시민)
 * @param {object} [o.settings] 방 설정 덮어쓰기 (예: { tribunalTime: 15 })
 */
async function seat(table, user, { n, me = 'CITIZEN', bots: botRoles = ['JOKER'], others = [], settings = {} }) {
    const humans = [user, ...others];
    const botCount = n - humans.length;
    const allBots = Array.from({ length: botCount }, (_, i) => botRoles[i] ?? 'CITIZEN');
    const humanRoles = [me, ...others.map(() => 'CITIZEN')];
    const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 };
    for (const role of [...humanRoles, ...allBots]) if (role in counts) counts[role] += 1;
    await pinTimebar(user.page);
    const t = await night.setup(table, {
        humans,
        bots: botCount,
        settings: { ...LONG_TIMES, ...night.custom(counts), ...settings },
        humanRoles,
        botRoles: allBots,
    });
    const s = await t.state();
    expect(s.players, '판 인원').toHaveLength(n);
    expect(s.players.find((p) => p.uuid === uuidOf(user))?.role, '사람 직업').toBe(me);
    return t;
}

/** 방장 봇 (방을 만든 첫 봇, 봇 순서를 다시 맞춰도 번호 1) */
const hostBot = (t) => t.bots.find((b) => b.index === 1);

/** 역할 공개 → 제 1일 낮 토론 (사람마다 역할 창 닫음, closeNotice면 "낮이 되었습니다"도 닫음) */
const toFirstDay = (t, { closeNotice = true } = {}) => day.toDay(t, { closeNotices: closeNotice });

/** 낮 토론이면 넘겨서 낮 투표까지 (화면은 안 봄 — 죽은 사람 화면엔 기권 단추가 없음) */
async function toVote(t) {
    const s = await day.waitState(t, (g) => g.phase === 'DAY');
    if (s.dayPhase === 'DAY_DISCUSSION') await t.advance();
    return day.waitState(t, (g) => g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE');
}

/** 살아서 붙어 있는 봇 (판 요약 기준) */
function liveBots(t, s) {
    return t.bots.filter((b) => {
        const row = s.players.find((p) => p.uuid === uuidOf(b));
        return row?.alive && row.isParticipating !== false && b.socket?.connected;
    });
}

/**
 * 피고를 정해 재판 열기: 살아 있는 봇(피고 빼고)이 모두 피고를 찍고 낮 투표 마감 → 재판
 * (사람은 안 내서 기권 — 봇 표가 기권보다 많아야 재판이라 5명 판도 3 대 2)
 * @returns {Promise<{ state:any, deadline:number }>} deadline = 서버가 알린 재판 마감 시각(ms)
 */
async function openTribunal(t, defendantUuid, { voters = null } = {}) {
    const s0 = await toVote(t);
    const list = voters ?? liveBots(t, s0).filter((b) => uuidOf(b) !== defendantUuid);
    await day.botsVote(t, defendantUuid, list);
    const since = Date.now();
    await t.advance();
    const state = await day.waitState(t, (g) => g.phase !== 'DAY');
    if (state.phase !== 'TRIBUNAL' || state.tribunal?.defendantUuid !== defendantUuid) {
        throw new Error(`재판이 안 열림: ${state.phase} (피고 ${state.tribunal?.defendantUuid ?? '없음'})`);
    }
    const payload = await list[0].waitForEvent('day_vote_resolved', { match: (p) => p?.outcome === 'TRIBUNAL', since });
    return { state, deadline: payload.tribunalDeadline };
}

/** 봇 재판 표 하나 → 서버 답 */
async function botVerdict(t, bot, vote, dayIndex = null) {
    const index = dayIndex ?? (await t.state()).dayIndex;
    return bot.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: index, vote });
}

/** 봇 여러 개 같은 재판 표 (거절되면 던짐) */
async function botsVerdict(t, vote, bots) {
    const { dayIndex } = await t.state();
    for (const bot of bots) {
        const r = await botVerdict(t, bot, vote, dayIndex);
        if (!r?.ok) throw new Error(`봇 재판 표 실패: ${r?.code}`);
    }
}

/** 재판 마감을 손잡이로 바로 (안 낸 사람은 기권) → 재판을 벗어난 판 요약, 판이 끝나 장부에서 빠졌으면 null — 5초 규칙 케이스에선 안 씀 */
async function closeTribunal(t) {
    await t.advance();
    let last = null;
    await expect.poll(async () => { last = await t.state(); return last?.phase ?? 'GONE'; }, { timeout: 20000, message: '재판 마감 기다림' }).not.toBe('TRIBUNAL');
    return last;
}

/** 밤을 넘겨 그 날짜 낮까지 */
const toDayOf = (t, dayIndex) => t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === dayIndex, { stepDelayMs: 500 });

// ───────── 재판 창 고르개 ─────────

const tribunal = (page) => page.getByRole('dialog', { name: '재판', exact: true });
const guilty = (page) => tribunal(page).getByRole('button', { name: TEXT.GUILTY, exact: true });
const notGuilty = (page) => tribunal(page).getByRole('button', { name: TEXT.NOT_GUILTY, exact: true });
const tribunalCard = (page, nickname) => tribunal(page).locator(`[data-ingame-player-nickname="${nickname}"]`);
const tribunalChatLog = (page) => tribunal(page).getByRole('log', { name: '채팅 내역' });
const tribunalChatBox = (page) => tribunal(page).getByRole('textbox', { name: '채팅 입력' });
const voteError = (page) => page.locator('[data-ingame-tribunal-vote-error]');
const expulsion = (page) => page.locator('[data-ingame-tribunal-expulsion]');
const phaseNotice = (page) => page.getByRole('dialog', { name: '단계 전환 안내', exact: true });
const deadChoice = (page) => page.getByRole('dialog', { name: '사망 후 선택' });
const timebar = (page) => page.getByLabel(/^제 \d+일 시간 흐름$/);
const barTimer = (page) => timebar(page).getByRole('timer');
const cardMenu = (page) => page.getByRole('menu', { name: '플레이어 행동' });

// ───────── "읽힘" 확인 (helpers/visible.js) ─────────

/**
 * 사람 눈에 읽히는지: 바탕은 요소 사진으로 잼 (판 화면 맨 밑이 검정 칸이라 스타일로 재면 그림 위 글도 다 검정 바탕으로 나옴)
 * 누름이 통과하는 글(pointer-events:none)·재판 창에 잠긴 시간 바 글은 uncovered:false로 부름 (가운데 점 검사가 늘 "가려짐"으로 나옴)
 */
const readable = (locator, o = {}) => expectReadable(locator, { method: o.contrast === false ? 'dom' : 'pixels', ...o });

/** 재판 창이 뜸 (nickname 주면 창에 피고 이름이 있는지도) */
async function expectTribunal(page, nickname = null) {
    await expect(tribunal(page)).toBeVisible({ timeout: 20000 });
    if (nickname) await expect(tribunal(page)).toContainText(nickname);
}

/** 단추 하나: 단추 자체(보임·화면 안·안 가려짐) + 단추 글(그림 위 흰 글 대비 — 글 칸은 누름이 통과) */
async function expectButtonReadable(button) {
    await readable(button, { contrast: false });
    await readable(button.locator('span').first(), { uncovered: false });
}

/** 유죄·무죄 단추 둘이 읽히고 눌림 */
async function expectVoteButtons(page) {
    for (const button of [guilty(page), notGuilty(page)]) {
        await expectButtonReadable(button);
        await expect(button).toBeEnabled();
    }
}

/** 유죄·무죄 단추가 없음 */
async function expectNoVoteButtons(page) {
    await expect(guilty(page)).toHaveCount(0);
    await expect(notGuilty(page)).toHaveCount(0);
}

/** 재판 창 안내 글(피고·죽음·완료)이 읽힘 */
async function expectNotice(page, text) {
    await readable(tribunal(page).getByText(text, { exact: true }), { uncovered: false });
}

/** 재판 창 피고 카드: 카드(보임·화면 안·안 가려짐), name이면 이름 글 대비도 */
async function expectDefendantCard(page, nickname, { name = false } = {}) {
    const card = tribunalCard(page, nickname);
    await readable(card, { contrast: false });
    if (name) await readable(card.locator('p > span'), { uncovered: false });
}

/** 유죄·무죄 누르기 → 완료 글까지 */
async function press(page, label) {
    await (label === TEXT.GUILTY ? guilty(page) : notGuilty(page)).click();
    await expect(tribunal(page).getByText(TEXT.DONE, { exact: true })).toBeVisible();
}

/** 떠 있는 확인 창 닫기 (안 떠 있으면 그냥 지나감), 사망 후 선택은 관전 계속하기 */
const calm = (page) => ui.closeOverlays(page, { keepWatching: true, rounds: 3, clickTimeoutMs: 1500 });

/** 추방 글이 읽힘 (큰 글자) */
async function expectExpelled(page, nickname) {
    await readable(expulsion(page).getByText(TEXT.expel(nickname), { exact: true }), { large: true, timeout: 25000 });
}

/**
 * 추방 연출 지나가기: 글 단계에서 누르면 바로 끝남 → then 창(기본 "단계 전환 안내")이 보일 때까지
 * (연출이 끝나야 밤 안내·사망 후 선택이 뜸)
 */
async function passExpulsion(page, { then = phaseNotice(page), timeout = 40000 } = {}) {
    const layer = expulsion(page);
    await expect(async () => {
        if (await layer.isVisible().catch(() => false)) await layer.click({ timeout: 500, force: true }).catch(() => {});
        await expect(layer).toBeHidden({ timeout: 500 });
        await expect(then).toBeVisible({ timeout: 500 });
    }).toPass({ timeout });
}

/** "밤이 되었습니다" 안내 창이 뜨고 글이 읽힘 → 창 */
async function expectNightNotice(page, { timeout = 40000 } = {}) {
    const dialog = phaseNotice(page);
    await expect(dialog).toContainText(TEXT.NIGHT, { timeout });
    await readable(dialog.getByText(TEXT.NIGHT, { exact: true }));
    return dialog;
}

/** 죽은 사람 화면: 낮 시작 연출·추방 연출을 지나 "사망 후 선택"에서 관전 계속하기 */
async function watchAsDead(page) {
    const choice = deadChoice(page);
    await expect(async () => {
        // 암살 영상이 안 틀어지면 글 창으로 바뀜 → 확인
        await night.closeDawnReport(page);
        const layer = expulsion(page);
        if (await layer.isVisible().catch(() => false)) await layer.click({ timeout: 500, force: true }).catch(() => {});
        await expect(choice).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 45000 });
    await choice.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(choice).toBeHidden();
}

/**
 * 사람을 1일 밤에 죽임: 1일 낮 투표는 아무도 안 냄(재판 없음) → 광대 봇이 사람을 고름 → 2일 낮, 사람은 관전 계속하기
 * @param {*} joker 광대 봇
 */
async function killHumanAtNight(t, user, joker) {
    await toVote(t);
    await t.advance();
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    const r = await night.botNight(t, joker, uuidOf(user));
    if (!r?.ok) throw new Error(`광대 봇 밤 행동 실패: ${r?.code}`);
    await toDayOf(t, 2);
    await night.waitDead(t, uuidOf(user));
    await watchAsDead(user.page);
}

// ───────── 시간 바 ─────────

/**
 * 접힌 시간 바 펼치기 (남은 시간·단계 글은 펼친 바에만 보임) — 판 화면이 안 잠긴 때(낮, 안내 창 닫은 뒤) 부름
 * 재판 연출 중·마감이 당겨진 5초 동안은 바가 저절로 펼쳐져 있어 "확대" 단추가 없음(이름이 "접기") → 그때 불러도 누르지 않고 지나감
 */
async function expandBar(page) {
    const bar = timebar(page);
    const open = bar.getByRole('button', { name: '시간흐름바 확대' });
    if (await open.isVisible().catch(() => false)) await open.click();
    await expect(bar.getByRole('button', { name: '시간흐름바 접기' })).toBeVisible();
}

/** 시간 바 "[5초 뒤 마감]"이 읽히고 남은 시간이 5초 이하 (재판 중 시간 바는 잠긴 판 화면 안이라 가려짐 검사는 뺌, 재판 중엔 바가 늘 펼쳐져 있음) */
async function expectSettleShown(page) {
    await readable(timebar(page).getByText(TEXT.SETTLE, { exact: true }), { uncovered: false, timeout: 4000 });
    await expect(barTimer(page)).toHaveText(/^00:0[0-5]$/);
}

/** 남은 시간 글("00:15") → 초 */
function clockSeconds(text) {
    const m = /(\d+):(\d+)/.exec(text ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ───────── 화면 기록 (페이지 안에서 바뀔 때마다 시각을 적음 — 기다림 간격에 안 묶이게) ─────────

/**
 * 기록 걸기 (판 화면에 들어온 뒤, 새로고침하면 다시): 재판 창 열림·닫힘 시각, "5초 뒤 마감" 표시 시각, 추방 연출(글·그때 주소), 시간 바 글 바뀜
 * 읽기는 readScreen → { opened:[ms], closed:[ms], settle:[ms], expulsions:[{at,text,path}], bar:[{at,day,label,clock}] }
 */
async function watchScreen(page) {
    await page.evaluate(() => {
        if (window.__a04Rec) return;
        const rec = { opened: [], closed: [], settle: [], expulsions: [], bar: [] };
        window.__a04Rec = rec;
        let wasOpen = false;
        let wasSettle = false;
        let lastExpel = null;
        let lastBar = null;
        const scan = () => {
            const now = Date.now();
            const open = document.querySelector('[data-ingame-tribunal-presentation]') !== null;
            if (open && !wasOpen) rec.opened.push(now);
            if (!open && wasOpen) rec.closed.push(now);
            wasOpen = open;
            const settle = document.querySelector('[data-ingame-phase-settle]') !== null;
            if (settle && !wasSettle) rec.settle.push(now);
            wasSettle = settle;
            const layer = document.querySelector('[data-ingame-tribunal-expulsion]');
            const text = layer ? layer.innerText.replace(/\s+/g, ' ').trim() : null;
            const expelKey = layer ? `${layer.getAttribute('data-ingame-tribunal-expulsion')}|${text}` : null;
            if (expelKey !== null && expelKey !== lastExpel) rec.expulsions.push({ at: now, text, path: window.location.pathname });
            lastExpel = expelKey;
            const bar = document.querySelector('[aria-label$="시간 흐름"]');
            if (bar) {
                const row = {
                    at: now,
                    day: bar.getAttribute('aria-label'),
                    label: bar.querySelector('p')?.textContent ?? null,
                    clock: bar.querySelector('[role="timer"]')?.textContent ?? null,
                };
                const key = `${row.day}|${row.label}|${row.clock}`;
                if (key !== lastBar) rec.bar.push(row);
                lastBar = key;
            }
        };
        new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        scan();
    });
}

const readScreen = (page) => page.evaluate(() => window.__a04Rec ?? null);

/**
 * 재판 단계 글이 붙은 첫 시간 바 줄 (재판 시작 때 남은 시간) — 펼쳐 둔 바에서만 나옴
 * "00:00"은 건너뜀: 단계가 바뀌는 그 한 번은 새 마감을 세기 전이라 빈 값이 잠깐 찍힐 수 있음
 */
function firstTribunalBar(rec) {
    return rec.bar.find((row) => row.label === TEXT.TRIBUNAL_BAR && row.clock !== null && row.clock !== '00:00') ?? null;
}

// ───────── 화면 소켓 손대기 (시험만: 서버 거절·보내는 중 상태를 만들기 위함) ─────────

/**
 * 화면이 여는 웹소켓을 잡아 둠 → 재판 표 보내기를 붙잡거나(hold) 날짜를 하루 앞으로 바꿔 보냄(stale = 서버가 "지난 재판"으로 거절)
 * 다음 페이지 열기부터 먹음 (판 차리기가 방 코드 화면을 새로 열어서 그때 붙음) — 판 차린 뒤 expectHooked로 확인
 */
async function hookSocket(page) {
    await page.addInitScript(() => {
        const Native = window.WebSocket;
        const net = { sockets: [], stale: false, hold: false, held: [] };
        window.__a04Net = net;
        window.WebSocket = class extends Native {
            constructor(...args) {
                super(...args);
                net.sockets.push(this);
            }

            send(data) {
                if (typeof data === 'string' && data.includes('"cast_tribunal_vote"')) {
                    if (net.hold) { net.held.push(() => super.send(data)); return; }
                    if (net.stale) { super.send(data.replace(/"dayIndex":(\d+)/, (m, n) => `"dayIndex":${Number(n) - 1}`)); return; }
                }
                super.send(data);
            }
        };
    });
}

/** 손잡이가 지금 화면에 붙어 있는지 (판 차리다 사람 창이 새로 바뀌면 빠짐 → 던져서 다시 돌게) */
async function expectHooked(page) {
    const ok = await page.evaluate(() => Boolean(window.__a04Net) && window.__a04Net.sockets.some((ws) => ws.readyState === 1));
    if (!ok) throw new Error('화면 소켓 손잡이가 안 붙음 (사람 창이 바뀜) — 다시 돌리기');
}

/** 손잡이 값 바꾸기 { stale?, hold? } */
const setNet = (page, patch) => page.evaluate((p) => { Object.assign(window.__a04Net, p); }, patch);

/** 붙잡아 둔 재판 표 보내기 풀기 */
const releaseHeld = (page) => page.evaluate(() => {
    const net = window.__a04Net;
    net.hold = false;
    for (const sendNow of net.held.splice(0)) sendNow();
});

/** 화면 소켓으로 사건 그대로 보내기 (답 안 받음) — 화면에 단추가 없는 요청을 보낼 때 */
async function sendRaw(page, event, payload) {
    await page.evaluate((frame) => {
        const open = (window.__a04Net?.sockets ?? []).filter((ws) => ws.readyState === 1 && ws.url.includes('socket.io'));
        if (open.length === 0) throw new Error('열린 화면 소켓 없음');
        open[open.length - 1].send(frame);
    }, `42${JSON.stringify([event, payload])}`);
}

/**
 * 화면 소켓 길목 (그 사람 브라우저 창 전부) — 판에 들어가기 전에 걸어야 그 뒤에 열린 소켓이 이 길로 감
 * cut()  열린 소켓을 닫고 새 접속도 거절 → 서버가 바로 끊김을 앎 (= 그 사람이 오프라인)
 * open() 다시 붙게 풂 → 화면 소켓이 스스로 다시 붙음 (= 온라인)
 * 브라우저 오프라인 흉내(context.setOffline)는 이미 열린 웹소켓을 안 끊어 서버가 20~45초 뒤(핑 시간 초과)에야 끊김을 앎 → 재판 15초 마감과 엇갈려 안 씀
 */
async function socketLine(person) {
    const line = { offline: false, pairs: [], context: person.context };
    await person.context.routeWebSocket(/\/socket\.io\//, (ws) => {
        if (line.offline) { ws.close(); return; }
        line.pairs.push({ ws, server: ws.connectToServer() });
    });
    line.cut = async () => {
        line.offline = true;
        for (const { ws, server } of line.pairs.splice(0)) {
            await Promise.resolve(server.close()).catch(() => {});
            await Promise.resolve(ws.close()).catch(() => {});
        }
    };
    line.open = () => { line.offline = false; };
    return line;
}

/** 길목이 지금 사람 창에 붙어 있는지 (판 차리다 사람 창이 새로 바뀌면 빠짐 → 던져서 다시 돌게) */
function expectLined(line, person) {
    if (person.context !== line.context || line.pairs.length === 0) throw new Error('화면 소켓 길목이 안 붙음 (사람 창이 바뀜) — 다시 돌리기');
}

module.exports = {
    TEXT, LONG_TIMES, uuidOf, nickOf, sleep, sleepUntil, pinTimebar, seat, hostBot, toFirstDay, toVote, liveBots, openTribunal,
    botVerdict, botsVerdict, closeTribunal, toDayOf,
    tribunal, guilty, notGuilty, tribunalCard, tribunalChatLog, tribunalChatBox, voteError, expulsion, phaseNotice, deadChoice,
    timebar, barTimer, cardMenu,
    readable, expectTribunal, expectButtonReadable, expectVoteButtons, expectNoVoteButtons, expectNotice, expectDefendantCard, press, calm,
    expectExpelled, passExpulsion, expectNightNotice, watchAsDead, killHumanAtNight,
    expandBar, expectSettleShown, clockSeconds, watchScreen, readScreen, firstTribunalBar,
    hookSocket, expectHooked, setNet, releaseHeld, sendRaw, socketLine, expectLined,
    day, night,
};
