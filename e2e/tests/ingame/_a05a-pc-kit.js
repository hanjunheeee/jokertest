'use strict';

// A05a(밤 차례·능력·밤 결과) PC 브라우저 시험이 같이 쓰는 도우미 — 직업 맞춘 판 열기·봇 처형·밤 한 번 돌리기·카드 메뉴 읽기·결과 창과 사망 카드 확인
// ingame/a05-*.spec.js(목록 A05a PC 간단 몫)가 씀, 이름이 .spec.js가 아니라 시험으로 안 셈
const { expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');

// 밤 차례가 도는 순서 (서버와 같음)
const TURN_ORDER = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
// 카드 메뉴의 밤 항목 이름 (직업 행동 넷 + 못 하는 날 기본 이름 + 낸 뒤 취소)
// 이름 일부로 찾음: 단추 읽기 이름에 대상 닉네임이 붙게 고쳐져도(시험목록 "목록이 틀려 보이는 곳" A05-F-182~185) 그대로 맞게 — 메뉴 닫기 단추 "취소"는 안 걸림
const NIGHT_ITEM_NAMES = /암살|보호|조사|확인|밤 행동|취소하기/;
// 카드 메뉴의 낮 투표 항목 이름
const VOTE_ITEM_NAMES = /투표하기|투표취소/;
// 판 화면을 덮는 연출 (단계 안내·추방 연출·암살 영상·낮 시작 글 창·밤 차례 안내)
const COVER_SELECTOR = [
    '[data-ingame-phase-entrance]',
    '[data-ingame-tribunal-expulsion]',
    '[data-ingame-night-success-kill]',
    '[data-ingame-dawn-report]',
    '[data-night-turn-role]',
].join(', ');
// 판 카드(누르는 칸) 안에서만 찾음 (재판 창도 같은 카드 부품을 써서 겹치지 않게)
const BOARD_CARD = '[role="button"][aria-haspopup="menu"]';

const uid = (who) => who.account.uuid;
const nick = (who) => who.nickname ?? who.account.nickname;

/** 판 요약이 조건에 맞을 때까지 기다림 (단계는 안 넘김) → 그때 판 요약 */
async function waitState(t, match, message = '판 상태 기다림', timeout = 20_000) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return Boolean(last && match(last)); }, { timeout, message }).toBe(true);
    return last;
}

/** 역할 확인 창: 떠 있으면 확인 눌러 닫음, 10초가 지나 이미 닫혔으면 그냥 지나감 */
async function closeReveal(page) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    await dialog.getByRole('button', { name: '확인' }).click({ timeout: 8000 }).catch(() => {});
    await expect(dialog).toBeHidden({ timeout: 12_000 });
}

/**
 * 판 열기: 사람 1명 + 봇, 직업을 정해 시작 → 서버 직업 확인 → 역할 창 닫고 화면 기록 걺
 * 봇은 스스로 아무것도 안 함 (낮 표·밤 행동은 시험이 execute·botAct로 시킬 때만) → 단계는 시험이 넘길 때만 넘어감
 *   (봇이 알아서 준비·기권하면, 사람이 죽은 판에선 산 사람이 다 낸 셈이라 낮이 몇 초 만에 지나가 화면을 볼 틈이 없음)
 * 밤 차례 120초·토론 150초가 기본 (화면을 누르고 보는 동안 단계가 저절로 안 넘어가게, 진짜 시간 시험만 밤 30초를 줌)
 * 화면 기록이 "낮이·밤이 되었습니다" 창과 낮 시작 글 창의 확인을 바로 눌러 줌 (그 창 내용은 A05b 몫)
 * @param {*} table fixtures의 table
 * @param {*} user fixtures의 user (직업을 못 맞추면 도우미가 새 사람으로 바꿔 끼움 → 열고 난 뒤 user.page·user.account를 씀)
 * @param {{ bots:number, settings?:object, me?:string, botRoles?:(string|null)[] }} o botRoles 순서대로 t.bots가 줄 섬
 * @returns {Promise<{ t:any, page:import('@playwright/test').Page }>}
 */
async function open(table, user, { bots, settings = {}, me = 'CITIZEN', botRoles = [] }) {
    const t = await n.setup(table, { humans: [user], bots, settings: { nightActionTime: 120, dayDiscussionTime: 150, ...settings }, humanRoles: [me], botRoles });
    const s = await t.state();
    expect(n.rowOf(s, uid(user))?.role, '사람 직업이 정한 대로').toBe(me);
    botRoles.forEach((role, i) => {
        if (role) expect(n.rowOf(s, uid(t.bots[i]))?.role, `봇 ${i} 직업이 정한 대로`).toBe(role);
    });
    const page = user.page;
    await closeReveal(page);
    await n.recordUi(page, { autoConfirm: true, autoConfirmDawn: true });
    await recordTurns(page);
    return { t, page };
}

/**
 * 화면에 뜬 밤 차례 안내를 순서대로 적기 시작 (open이 걸어 둠)
 * 안내 창의 직업 표시 값이 바뀔 때마다 한 줄 — 차례가 바로 이어지면 같은 창이 글만 바뀌어서, 창이 새로 생겼는지로 세면 놓침
 */
async function recordTurns(page) {
    await page.evaluate(() => {
        if (window.__a05Turns) return;
        window.__a05Turns = [];
        let last = null;
        const scan = () => {
            const role = document.querySelector('[data-night-turn-role]')?.getAttribute('data-night-turn-role') ?? null;
            if (role !== null && role !== last) window.__a05Turns.push(role);
            last = role;
        };
        new MutationObserver(scan).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['data-night-turn-role'],
        });
        scan();
    });
}

/** 지금까지 화면에 뜬 밤 차례 안내 (직업 값 순서대로) */
const turnsSeen = (page) => page.evaluate(() => window.__a05Turns ?? []);

/**
 * 봇 표만으로 한 사람 처형 (낮 투표 → 재판 유죄), 사람은 아무것도 안 냄 → 죽으면 돌아옴 (그날 밤이 열려 있음)
 * 낮 투표는 최다 득표가 기권보다 많아야 재판 → 모자라면 시작 전에 던짐
 */
async function execute(t, target) {
    const uuid = uid(target);
    await t.assertBotsCanExecute(uuid);
    // 처형하는 동안만 봇이 표를 냄: 그 사람을 찍고 재판에선 유죄 (끝나면 다시 아무것도 안 함)
    t.playBots((bot) => ({
        readyForVote: false, dayVote: uid(bot) === uuid ? 'abstain' : uuid, tribunal: 'GUILTY', night: 'skip', pollMs: 200,
    }));
    await n.advanceUntilSettled(t, (s) => n.rowOf(s, uuid)?.alive === false);
    await t.stopBots();
}

/** 봇 밤 행동 보내기 (target null = 건너뛰기), 서버가 받아야 함 */
async function botAct(t, bot, target) {
    const reply = await n.botNight(t, bot, target === null ? null : uid(target));
    expect(reply?.ok, `봇 밤 행동을 서버가 받음 (거절 코드: ${reply?.code})`).toBe(true);
}

/** 그 날 낮까지 단계 넘기기 (봇 틈 주며) → 판 요약 */
const toDay = (t, dayIndex) => n.toDay(t, { dayIndex });

/** 낮 시작 연출 한 번 넘기기: 암살 영상이 제때 안 끝나 뜬 건너뛰기는 누르고, 글 창은 확인 */
async function passDawnOnce(page) {
    const skip = page.locator('[data-ingame-night-success-kill]').getByRole('button', { name: '건너뛰기' });
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
    await n.closeDawnReport(page);
}

/** 판 화면을 막는 창 한 바퀴 닫기: 역할 창·단계 안내·밤 차례 안내·낮 시작 연출·추방 연출·사망 뒤 선택 (밤 결과 창은 시험이 직접 봐서 안 닫음) */
async function closeBlockers(page) {
    await n.closeRoleReveal(page);
    await n.closeNotices(page);
    await passDawnOnce(page);
    // 추방 연출: 영상이 멈춰 뜬 건너뛰기는 누르고, 글 단계는 화면을 누르면 바로 끝남 (영상 단계 누름은 아무 일 없음)
    const expulsion = page.locator('[data-ingame-tribunal-expulsion]').last();
    if (await expulsion.isVisible().catch(() => false)) {
        const skip = expulsion.getByRole('button', { name: '건너뛰기' });
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 500 }).catch(() => {});
        else await expulsion.click({ timeout: 500, force: true }).catch(() => {});
    }
    await n.keepWatching(page);
}

/** 판 화면을 덮는 것이 하나도 없는지 (없을 때 누른 것만 믿으려고) */
async function expectClear(page) {
    await expect(page.locator(COVER_SELECTOR)).toHaveCount(0, { timeout: 500 });
    await expect(page.getByRole('dialog', { name: '내 역할 보기' })).toHaveCount(0, { timeout: 500 });
    await expect(page.getByRole('dialog', { name: '사망 후 선택' })).toHaveCount(0, { timeout: 500 });
}

/**
 * 화면이 그 날 낮까지 따라올 때까지: 시간 바 날짜가 그 날이 되고 낮 시작 연출(암살 영상·글 창)이 다 끝남 — 밤 결과 창·사망 카드는 이 뒤에 봄
 * (날짜는 밤 결과를 받는 순간 하나 늘어남 → 전날 밤 화면과 헷갈리지 않음. 서버를 그 날 낮까지 넘긴 뒤 부름)
 */
async function dayShown(page, dayIndex) {
    await expect(async () => {
        await closeBlockers(page);
        await expect(page.locator(`[aria-label="제 ${dayIndex}일 시간 흐름"]`)).toBeAttached({ timeout: 1000 });
        await expect(page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]')).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 45_000 });
}

/** 시간 바를 펼쳐 타이머가 보이게 함 (PC는 접힌 채로 시작해 남은 시간이 안 보임, 판 화면이 안 잠긴 낮에 부름) */
async function expandTimebar(page) {
    const button = page.locator('[data-ingame-timebar-expand]');
    await expect(async () => {
        await closeBlockers(page);
        // 타이머를 채팅 칸에 두는 배치(개발 서버)면 펼치기 단추가 없고 타이머가 늘 보임
        if ((await button.count()) > 0 && (await button.getAttribute('aria-expanded')) !== 'true') await button.click({ timeout: 1500 });
        await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
}

/** 화면이 그 밤(몇 번째 밤인지)까지 따라올 때까지: "밤이 되었습니다"가 그만큼 떴고 추방 연출·단계 안내가 다 닫힘 */
async function nightShown(page, nightCount) {
    await expect(async () => {
        await closeBlockers(page);
        const seen = ((await n.readUi(page))?.entrances ?? []).filter((phase) => phase === 'NIGHT').length;
        expect(seen).toBeGreaterThanOrEqual(nightCount);
        await expect(page.locator('[data-ingame-phase-entrance], [data-ingame-tribunal-expulsion]')).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 45_000 });
}

/** 서버가 아직 그 밤 그 차례인지 (화면을 본 것이 그 차례 동안이었는지 확인) */
async function expectTurn(t, role, dayIndex) {
    const s = await t.state();
    expect({ phase: s?.phase, role: s?.nightTurnRole, day: s?.dayIndex }, '아직 그 차례여야 함').toEqual({ phase: 'NIGHT', role, day: dayIndex });
}

const menuOf = (page) => page.getByRole('menu', { name: '플레이어 행동' });

/** 열린 카드 메뉴 닫기 (Esc), 없으면 그냥 지나감 */
async function closeMenu(page) {
    const menu = menuOf(page);
    await expect(async () => {
        if (await menu.isVisible().catch(() => false)) await page.keyboard.press('Escape');
        await expect(menu).toBeHidden({ timeout: 500 });
    }).toPass({ timeout: 5000 });
}

/** 카드를 눌러 메뉴 열기 → 메뉴 (막는 창은 닫으면서 다시) */
async function openMenu(page, nickname) {
    const menu = menuOf(page);
    await expect(async () => {
        await closeBlockers(page);
        if (!(await menu.isVisible().catch(() => false))) await n.cardButton(page, nickname).click({ timeout: 1500 });
        await expect(menu).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    return menu;
}

/**
 * 그 사람 카드를 한 번 눌러 메뉴 항목이 어떤지 읽음 (읽고 나면 메뉴를 닫음)
 * @returns {Promise<'있음'|'잠김'|'없음'>} 있음 = 눌러 고를 수 있음, 잠김 = 보이지만 못 누름, 없음 = 그 항목이 없거나 메뉴가 안 열림
 */
async function itemState(page, nickname, names = NIGHT_ITEM_NAMES) {
    const menu = menuOf(page);
    // 덮는 창이 없을 때 한 번만 누름 (창에 막혀 안 열린 것을 "없음"으로 읽지 않게)
    await expect(async () => {
        await closeBlockers(page);
        if (await menu.isVisible().catch(() => false)) await page.keyboard.press('Escape');
        await expect(menu).toBeHidden({ timeout: 500 });
        await expectClear(page);
        await n.cardButton(page, nickname).click({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    const opened = await menu.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false);
    if (!opened) return '없음';
    const item = menu.getByRole('menuitem', { name: names });
    let state = '없음';
    if ((await item.count()) > 0) state = (await item.first().isEnabled()) ? '있음' : '잠김';
    await closeMenu(page);
    return state;
}

/** 그 사람 카드 메뉴에 그 밤 항목이 있고 눌리며 눈에 읽히는지 (그림 단추라 대비는 안 봄) */
async function expectNightItem(page, nickname, label) {
    const menu = await openMenu(page, nickname);
    const item = menu.getByRole('menuitem', { name: label });
    await expect(item).toBeEnabled();
    await expectReadable(item, { contrast: false });
    await closeMenu(page);
}

/** 밤 행동을 화면으로 냄: 카드 메뉴에서 '암살'·'보호'·'조사'·'확인'을 누름 → 서버가 받으면 건너뛰기 단추가 잠김 (거절이면 여기서 걸림) */
async function actUi(page, nickname, label) {
    const menu = await openMenu(page, nickname);
    const item = menu.getByRole('menuitem', { name: label });
    await expect(item).toBeEnabled();
    await item.click();
    await expect(menu).toBeHidden();
    await expect(n.skipButton(page)).toBeDisabled();
}

/** 내 밤 차례 화면이 열릴 때까지: 건너뛰기 단추가 켜짐 (막는 창은 닫으면서) → 그 단추 */
async function myTurnReady(page) {
    const skip = n.skipButton(page);
    await expect(async () => {
        await closeBlockers(page);
        await expect(skip).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    return skip;
}

/** 밤 건너뛰기를 화면으로 냄: 건너뛰기 단추가 눈에 읽히는지 보고 누름 → 서버가 받으면 단추가 잠김 */
async function skipUi(page) {
    const skip = n.skipButton(page);
    await expect(async () => {
        await closeBlockers(page);
        await expect(skip).toBeEnabled({ timeout: 1000 });
        await expectReadable(skip, { contrast: false, timeout: 1000 });
        await skip.click({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await expect(skip).toBeDisabled();
}

/**
 * 밤 한 번을 차례 순서대로 돌림: 봇 차례는 소켓으로 대상을 보내고, 사람 차례는 화면에서 고름
 * picks에 없는 직업 차례는 아무도 안 냄 (뒤에서 단계를 넘길 때 건너뛰기로 채워짐), 밤 끝까지 넘기는 건 부른 쪽이 toDay 등으로
 * @param {object} o
 * @param {*} o.t 판
 * @param {import('@playwright/test').Page} o.page 사람 화면
 * @param {string} o.me 사람 직업
 * @param {number} [o.night=1] 몇 번째 밤 (= 그 밤의 날짜)
 * @param {Record<string, any>} [o.who] 직업 → 그 직업 봇 (사람 직업 칸은 필요 없음)
 * @param {Record<string, any|null>} [o.picks] 직업 → 고를 사람 (null = 건너뛰기) — 사람 직업 칸이면 화면으로, 나머지는 who[직업] 봇이 냄
 * @param {Record<string, [any, any|null][]>} [o.mates] 직업 → [[같은 직업 봇, 고를 사람]...] (그 차례에 사람보다 먼저 냄)
 */
async function playNight({ t, page, me, night = 1, who = {}, picks = {}, mates = {} }) {
    for (const role of TURN_ORDER) {
        const picked = Object.hasOwn(picks, role);
        const others = mates[role] ?? [];
        if (!picked && others.length === 0) continue;
        await n.toTurn(t, role, { dayIndex: night });
        for (const [bot, target] of others) await botAct(t, bot, target);
        if (!picked) continue;
        if (role !== me) await botAct(t, who[role], picks[role]);
        else if (picks[role] === null) await skipUi(page);
        else await actUi(page, nick(picks[role]), n.ACTION_LABELS[role]);
    }
}

/** 판 카드 (닉네임으로) — 상태 칸 data-ingame-player-status: alive·dead·disconnected */
const card = (page, nickname) => n.cardButton(page, nickname).locator('[data-ingame-player-nickname]');

/** 판에서 사망 표시인 카드의 닉네임들 (가나다 순) */
async function deadNames(page) {
    const names = await page.locator(`${BOARD_CARD} [data-ingame-player-status="dead"]`)
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-ingame-player-nickname')));
    return names.sort();
}

/** 사망 카드가 딱 이 사람들인지 (낮 화면까지 따라온 뒤 부름) */
async function expectDeadNames(page, people) {
    const want = people.map(nick).sort();
    await expect.poll(() => deadNames(page), { message: '사망 카드 목록' }).toEqual(want);
}

/** 산 카드 수 */
async function expectAliveCount(page, count) {
    await expect(page.locator(`${BOARD_CARD} [data-ingame-player-status="alive"]`)).toHaveCount(count);
}

async function expectDead(page, who) {
    await expect(card(page, nick(who))).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15_000 });
}

async function expectAlive(page, who) {
    await expect(card(page, nick(who))).toHaveAttribute('data-ingame-player-status', 'alive', { timeout: 15_000 });
}

/**
 * 사망 표시 그림이 눈에 보이는지: 그림을 담은 칸이 크기 있고 화면 안이며 안 투명함 + 그림이 실제로 불러와짐
 * (글 없는 그림이라 대비는 안 보고, 누름을 안 받는 층이라 가려짐 검사도 뺌. 그림은 칸보다 크게 키워 잘려 보여서 칸으로 잼)
 */
async function expectDeadBadgeReadable(page, who) {
    const own = card(page, nick(who));
    await expectReadable(own.locator('div:has(> img[src*="ingame-status"])'), { contrast: false, uncovered: false });
    await expect.poll(
        () => own.locator('img[src*="ingame-status"]').evaluate((img) => img.complete && img.naturalWidth > 0),
        { message: '사망 표시 그림이 불러와짐' },
    ).toBe(true);
}

/** 카드 초상 그림 주소 (카드의 첫 그림) */
const portraitSrc = (page, who) => card(page, nick(who)).locator('img').first().getAttribute('src');

const resultBox = (page) => page.locator('[data-ingame-night-private-result]');

/**
 * 내게만 오는 밤 결과 창이 뜨고 글이 눈에 읽히는지 (낮 시작 연출 뒤에 뜸 → 막는 창은 닫으면서 기다림)
 * @param {'INVESTIGATE'|'CONFIRM'|'ASSASSINATE'} kind 조사·확인·암살 실패
 * @param {string[]} texts 창에 들어 있어야 하는 글 조각 (닉네임·"○○입니다" 등)
 */
async function expectResult(page, kind, texts) {
    const dialog = page.locator(`[data-ingame-night-private-result="${kind}"]`).getByRole('dialog', { name: '밤 조사 결과' });
    await expect(async () => {
        await closeBlockers(page);
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 45_000 });
    for (const text of texts) await expect(dialog).toContainText(text);
    await expectReadable(dialog.getByRole('paragraph').first());
    return dialog;
}

/** 조사·확인 결과 창: 대상 닉네임과 직업 이름이 보임 */
const expectRoleResult = (page, kind, target, role) => expectResult(page, kind, [nick(target), `${n.ROLE_NAMES[role]}입니다`]);

/** 밤 결과 창의 확인을 눌러 닫음 */
async function confirmResult(page) {
    await resultBox(page).getByRole('dialog', { name: '밤 조사 결과' }).getByRole('button', { name: '확인' }).click();
    await expect(resultBox(page)).toHaveCount(0);
}

/** 판 화면에 들어온 뒤 지금까지 뜬 밤 결과 창 글 목록 (화면 기록) */
const resultsSeen = async (page) => (await n.readUi(page))?.privateResults ?? [];

/** 그 날 낮 화면까지 따라온 뒤에도 밤 결과 창이 새로 안 떴는지 (seen = 그 전까지 뜬 수) */
async function expectNoNewResult(page, dayIndex, seen = 0) {
    await dayShown(page, dayIndex);
    expect(await resultsSeen(page), '밤 결과 창이 뜬 적 없어야 함').toHaveLength(seen);
    await expect(resultBox(page)).toHaveCount(0);
}

/** 봇이 받은 사건의 도착 시각(ms) — 올 때까지 기다림 */
async function eventAt(bot, event, match, timeoutMs = 20_000) {
    await bot.waitForEvent(event, { match, timeoutMs });
    return bot.events.find((row) => row.event === event && match(row.payload)).at;
}

/** 화면 타이머 남은 초 (MM:SS) — 못 읽으면 null */
async function timerSeconds(page) {
    const text = await page.getByRole('timer').first().innerText({ timeout: 500 }).catch(() => null);
    const m = (text ?? '').match(/(\d+):(\d+)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * 결과 화면까지 가서 승패 띠와 이긴 편 글이 눈에 읽히는지 (밤 암살로 끝나면 낮 시작 연출 뒤에 결과 화면 → 연출을 넘기며 기다림)
 * @param {{ banner:'승리'|'패배', team:string }} o team 예: '광대 진영 승리'
 */
async function expectResultScreen(page, { banner, team }) {
    await expect(async () => {
        await closeBlockers(page);
        await expect(page).toHaveURL(/\/gameresult/, { timeout: 1000 });
    }).toPass({ timeout: 60_000 });
    await n.reachResult(page);
    const label = page.getByText(/^(승리|패배)$/);
    await expect(label).toHaveText(banner);
    // 띠 글은 누름을 안 받는 층이라 가려짐 검사는 뺌 (보임·크기·화면 안·대비는 봄)
    await expectReadable(label, { uncovered: false });
    await expectReadable(page.getByText(team, { exact: true }));
}

module.exports = {
    TURN_ORDER, NIGHT_ITEM_NAMES, VOTE_ITEM_NAMES, uid, nick, waitState, open, execute, botAct, toDay,
    recordTurns, turnsSeen, closeBlockers, dayShown, expandTimebar, nightShown, expectTurn, closeMenu, openMenu, itemState, expectNightItem, actUi, myTurnReady, skipUi, playNight,
    card, deadNames, expectDeadNames, expectAliveCount, expectDead, expectAlive, expectDeadBadgeReadable, portraitSrc,
    resultBox, expectResult, expectRoleResult, confirmResult, resultsSeen, expectNoNewResult, eventAt, timerSeconds, expectResultScreen,
};
