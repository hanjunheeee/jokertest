'use strict';

// 바 묶음(바-02~14) 판 안 장면 도우미 파일, 판 차리기(5명·9명·인원별)·정한 자리까지 판 굴리기·덮개 창 닫기·아직 그 자리인지
// scenes/ba.js가 씀 — 판 굴리기는 e2e Table 손잡이, 화면 누르기는 e2e 인게임 시험 도우미(a-day·b-night·c-chat·_a04-pc·_a05a-pc-kit) 그대로
const { fromE2e, e2eRequire } = require('../lib/paths');
const { seat, start, customRoleSettings } = require('../lib/table');

const { expect } = e2eRequire('@playwright/test');
const day = fromE2e('tests/ingame/a-day/_lib');
const night = fromE2e('tests/ingame/b-night/_night');
const chat = fromE2e('tests/ingame/c-chat/_lib');
const K4 = fromE2e('tests/ingame/_a04-pc');
const K5 = fromE2e('tests/ingame/_a05a-pc-kit');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = (x) => x.account.uuid;
const nick = (x) => x.nickname ?? x.account.nickname;

/**
 * 판 짜임 (사람 [창 이름, 직업] · 봇 직업 순서 · 방 직접 구성 수)
 * - small: 바-02·03을 처음부터 볼 때 5명 (나 광대 + 광대 동료 봇) — 바-01에서 이어 오면 바-01 판(5명) 그대로
 * - big: 바-04~14 한 판 9명 — 봇 5표 > 기권 4라 봇 표만으로 재판이 열림, 한 명 죽어도 광대 2 < 나머지 6이라 판이 안 끝남
 */
const PLANS = Object.freeze({
    small: { humans: [['나 (광대)', 'JOKER']], bots: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'], counts: { JOKER: 2 } },
    big: {
        humans: [['나 (광대)', 'JOKER'], ['귀족', 'CITIZEN'], ['경비원', 'GUARD']],
        bots: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
        counts: { JOKER: 2, DOCTOR: 1, GUARD: 1 },
    },
});

// 판 화면을 덮는 연출 (단계 안내·추방 연출·암살 영상·낮 시작 글 창·밤 차례 안내) — _a05a-pc-kit COVER_SELECTOR와 같음
const COVERS = [
    '[data-ingame-phase-entrance]', '[data-ingame-tribunal-expulsion]', '[data-ingame-night-success-kill]',
    '[data-ingame-dawn-report]', '[data-night-turn-role]',
].join(', ');
const BLOCK_DIALOGS = /^(내 역할 보기|사망 후 선택|단계 전환 안내|밤 역할 안내|밤 조사 결과|알림)$/;
// 낮 시작 연출 (암살 영상 또는 그 글 창)
const DAWN_SHOW = '[data-ingame-night-success-kill], [data-ingame-dawn-report]';

// ───────── 판 차리기 ─────────

/** 짜임대로 앉히기 (시작은 안 함) → s.state.seated */
async function seatPlan(s, name) {
    const plan = PLANS[name];
    const humans = [];
    for (const [label] of plan.humans) humans.push(await s.person({ label }));
    s.state.seated = await seat(s, {
        humans,
        bots: plan.bots.length,
        settings: customRoleSettings(plan.counts),
        roles: ({ humans: hs, bots }) => {
            const out = {};
            plan.humans.forEach(([, role], i) => { out[uid(hs[i])] = role; });
            plan.bots.forEach((role, i) => { out[uid(bots[i])] = role; });
            return out;
        },
    });
    s.state.plan = name;
}

/** 앉힌 판 시작 → 사람 직업이 맞는지 보고 배역(나·귀족·경비원·광대 동료·의사·귀족 봇들)을 적어 둠 */
async function startPlan(s) {
    const t = await start(s.state.seated);
    s.state.table = t;
    s.state.step = 0;
    s.keep(() => t.stopBots().catch(() => {}));
    const g = await t.state();
    const roleOf = (who) => g.players.find((p) => p.uuid === uid(who))?.role;
    const plan = PLANS[s.state.plan];
    plan.humans.forEach(([label, role], i) => {
        if (roleOf(t.humans[i]) !== role) throw new Error(`${label} 직업이 ${roleOf(t.humans[i])} (바람 ${role}) — 역할 예약이 안 맞음 → again`);
    });
    const botsOf = (role) => t.bots.filter((b) => roleOf(b) === role);
    s.state.cast = {
        me: t.humans[0], noble: t.humans[1], guard: t.humans[2],
        ally: botsOf('JOKER')[0], doctor: botsOf('DOCTOR')[0], citizens: botsOf('CITIZEN'),
    };
    return t;
}

/** 인원별 판 앉히기 (바-03 다른 인원): 사람 1 + 봇 n-1, 직업은 자동 */
async function seatSize(s, n) {
    const me = await s.person({ label: `나 (${n}명 판)` });
    s.state.seated = await seat(s, { humans: [me], bots: n - 1 });
    s.state.plan = `size${n}`;
}

/** 인원별 판 시작 → 첫 낮 토론까지 + 봇 채팅 한 줄 (가운데 채팅 창에 글이 있게) */
async function startSize(s) {
    const t = await start(s.state.seated);
    s.state.table = t;
    s.state.step = 0;
    s.keep(() => t.stopBots().catch(() => {}));
    await reach(s, 'day1');
    await botSay(t, t.bots[1] ?? t.bots[0], '다들 반갑습니다');
    await calm(t.humans[0].page, { quietMs: 800 });
}

/** 이어 받은 판이 있으면 그대로(짜임이 다르면 멈춤), 없으면 그 짜임으로 새 판 → Table */
async function table(s, name) {
    if (s.state.table) {
        const have = s.state.plan ?? 'b01';
        const ok = name === 'small' ? ['small', 'b01'].includes(have) : have === name;
        if (!ok) throw new Error(`앞 장면 판(${have})에선 이 장면을 이어 볼 수 없음 → goto로 이 번호부터 새로`);
        return s.state.table;
    }
    await seatPlan(s, name);
    return startPlan(s);
}

// ───────── 화면 손대기 ─────────

/**
 * 덮개 창(역할 창·단계 안내·밤 차례 안내·낮 시작 연출·추방 연출·밤 결과·사망 뒤 선택)을 닫아 가며 조용해질 때까지
 * bar 주면 시간 바 날짜("제 N일 시간 흐름")가 그 날이 될 때까지도 — 못 끝나도 던지지 않음 (남은 창도 그 화면이라)
 */
async function calm(page, { bar = null, quietMs = 1500, timeoutMs = 30_000 } = {}) {
    const until = Date.now() + timeoutMs;
    let quietSince = 0;
    while (Date.now() < until) {
        await K5.closeBlockers(page).catch(() => {});
        await chat.dismissOverlays(page, { rounds: 1 }).catch(() => {});
        const covers = await page.locator(COVERS).count().catch(() => 0);
        const dialogs = await page.getByRole('dialog', { name: BLOCK_DIALOGS }).count().catch(() => 0);
        const dayOk = bar === null || (await page.locator(`[aria-label="제 ${bar}일 시간 흐름"]`).count().catch(() => 0)) > 0;
        if (covers + dialogs === 0 && dayOk) {
            quietSince = quietSince || Date.now();
            if (Date.now() - quietSince >= quietMs) return true;
        } else {
            quietSince = 0;
        }
        await sleep(250);
    }
    return false;
}
const calmAll = (t, o) => Promise.all(t.humans.map((h) => calm(h.page, o)));

/** 봇 낮(재판) 채팅, 0.5초 간격에 걸리면 다시 */
async function botSay(t, bot, text) {
    for (let i = 0; i < 10; i += 1) {
        const r = await bot.request('submit_game_chat_message', { gameId: t.gameId, text });
        if (r?.ok) return;
        await sleep(300);
    }
    throw new Error(`봇 채팅 거절: ${text}`);
}

/** 투표 현황 창 열기 (덮개 창이 막으면 닫고 다시) — a03-abstain-majority openStatus와 같음 */
async function openStatus(page) {
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await dialog.isVisible())) {
            await chat.dismissOverlays(page, { rounds: 1 });
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    return dialog;
}

/** 투표 현황 창이 떠 있으면 닫기 */
async function closeStatus(page) {
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    if (!(await dialog.isVisible().catch(() => false))) return;
    await page.getByRole('button', { name: '투표 현황 닫기' }).first().click({ timeout: 2000 }).catch(() => page.keyboard.press('Escape'));
    await expect(dialog).toBeHidden({ timeout: 5000 });
}

/** 채팅 크게 보기 열기 (채팅 틀의 키보드용 단추) — a06-day-tribunal-chat openCloseup과 같음 */
async function openCloseup(page) {
    await calm(page, { quietMs: 800 });
    await page.getByRole('button', { name: '채팅 크게 보기' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '채팅 클로즈업' })).toBeVisible();
}
async function closeCloseup(page) {
    const dialog = page.getByRole('dialog', { name: '채팅 클로즈업' });
    if (await dialog.isVisible().catch(() => false)) await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5000 }).catch(() => {});
}

/** 사람 화면 낮 표: 기권 단추 (서버가 받으면 잠김) */
async function abstainUi(page) {
    const button = page.getByRole('button', { name: '기권' });
    await expect(async () => {
        await chat.dismissOverlays(page, { rounds: 1 });
        if (await button.isEnabled()) await button.click({ timeout: 1000 });
        await expect(button).toBeDisabled({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
}

/** 다 낸 뒤 5초 당김 표시("[5초 뒤 마감]") 칸이 붙을 때까지 */
const settleShown = (page) => expect(page.locator('[data-ingame-phase-settle]').first()).toBeAttached({ timeout: 5000 });

const palette = (page) => page.getByRole('group', { name: '이모티콘 팔레트' });
/** 내 카드 우클릭 → 이모티콘 팔레트 */
async function openPalette(page, nickname) {
    await expect(async () => {
        await night.cardButton(page, nickname).click({ button: 'right', timeout: 2000 });
        await expect(palette(page)).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    return palette(page);
}

// ───────── 판 자리 (차례대로만 감) ─────────

const where = (g) => `${g?.phase ?? '없음'}/${g?.dayIndex ?? '-'}/${g?.dayPhase ?? '-'}`;
async function mustBe(t, ok, label) {
    const g = await t.state();
    if (!g || !ok(g)) throw new Error(`판이 ${label} 자리가 아님 (지금 ${where(g)}) → again으로 처음부터`);
    return g;
}
const isDay = (n, dayPhase = null) => (g) => g.phase === 'DAY' && g.dayIndex === n && (dayPhase === null || g.dayPhase === dayPhase);
const isNight = (n) => (g) => g.phase === 'NIGHT' && g.dayIndex === n;

/** 산 봇이 모두 X를 찍고 마감 → 재판 (사람은 안 냄 = 기권, 봇 5표 > 기권 4) */
async function botsToTribunal(s, t) {
    const { cast } = s.state;
    const X = cast.citizens[0];
    const g = await K4.toVote(t);
    const voters = t.bots.filter((b) => b !== X && g.players.find((p) => p.uuid === uid(b))?.alive);
    await day.botsVote(t, uid(X), voters);
    const after = await day.resolveVote(t);
    if (after.phase !== 'TRIBUNAL') throw new Error(`재판이 안 열림 (${where(after)})`);
    for (const h of t.humans) await K4.expectTribunal(h.page, nick(X));
    return X;
}

/** 재판을 봇 무죄로 닫음 → 밤 */
async function botsAcquit(s, t) {
    const X = s.state.cast.citizens[0];
    await K4.botsVerdict(t, 'NOT_GUILTY', t.bots.filter((b) => b !== X));
    const after = await K4.closeTribunal(t);
    if (after?.phase !== 'NIGHT') throw new Error(`재판 뒤 밤이 아님 (${where(after)})`);
}

const STEPS = [
    ['start', null],
    // 역할 확인 → 1일 낮 토론, 모든 사람 창의 역할 창·낮 안내 닫음 (어느 판이든)
    ['day1', async (s, t) => {
        for (const h of t.humans) await night.closeRoleReveal(h.page);
        await t.advanceUntil('DAY');
        await mustBe(t, isDay(1, 'DAY_DISCUSSION'), '1일 낮 토론');
        await calmAll(t, { bar: 1 });
    }],
    // 1일 토론 채팅: 사람 둘 + 봇 셋이 한 줄씩
    ['chat1', async (s, t) => {
        const { cast } = s.state;
        await mustBe(t, isDay(1, 'DAY_DISCUSSION'), '1일 낮 토론');
        await chat.say(cast.me.page, '오늘 밤은 다들 조심하세요');
        await botSay(t, cast.ally, '저는 그냥 귀족입니다');
        await chat.say(cast.noble.page, '수상한 사람이 있네요');
        await botSay(t, cast.doctor, '아직은 모르겠어요');
        await botSay(t, cast.citizens[0], '저를 의심하지 마세요');
        await chat.say(cast.guard.page, '내일 다시 이야기해요');
    }],
    // 1일 투표 → 재판(봇 X) → 사람 셋이 화면으로 "무죄"(바-10 둘째 재판 버그 조건) → 봇 무죄 → 1일 밤, 광대 밤 채팅
    ['night1', async (s, t) => {
        const { cast } = s.state;
        await mustBe(t, isDay(1), '1일 낮');
        await closeCloseup(cast.noble.page);
        await botsToTribunal(s, t);
        for (const h of t.humans) {
            await K4.calm(h.page);
            await K4.press(h.page, K4.TEXT.NOT_GUILTY);
        }
        await botsAcquit(s, t);
        await calmAll(t, { bar: 1 });
        await cast.ally.request('submit_joker_chat_message', { gameId: t.gameId, text: '오늘은 쉬어 갑시다' });
        await chat.say(cast.me.page, '알겠어요, 내일 봐요');
        await calmAll(t, { quietMs: 800 });
    }],
    // 1일 밤 아무도 안 냄 → 2일 낮 토론
    ['day2', async (s, t) => {
        await mustBe(t, isNight(1), '1일 밤');
        await night.toDay(t, { dayIndex: 2 });
        await calmAll(t, { bar: 2 });
    }],
    // 2일 토론 → 투표 (사람 화면에 기권 단추까지)
    ['vote2', async (s, t) => {
        await mustBe(t, isDay(2, 'DAY_DISCUSSION'), '2일 낮 토론');
        await K5.closeMenu(s.state.cast.me.page).catch(() => {});
        await t.advance();
        await day.waitState(t, isDay(2, 'DAY_VOTE'));
        for (const h of t.humans) await expect(h.page.getByRole('button', { name: '기권' })).toBeVisible({ timeout: 15_000 });
    }],
    // 2일 투표: 봇 둘만 X, 나머지 봇·귀족·경비원은 기권 → 나 한 표만 남음 (누가 무엇을 내도 기권이 최다 이상)
    ['settle2', async (s, t) => {
        const { cast } = s.state;
        await mustBe(t, isDay(2, 'DAY_VOTE'), '2일 낮 투표');
        await closeStatus(cast.me.page);
        const X = cast.citizens[0];
        await day.botsVote(t, [[cast.ally, uid(X)], [cast.doctor, uid(X)], ...cast.citizens.map((b) => [b, null])]);
        await abstainUi(cast.noble.page);
        await abstainUi(cast.guard.page);
    }],
    // 2일 투표 마감(안 냈으면 기권) → 기권이 많아 재판 없이 2일 밤
    ['night2', async (s, t) => {
        const g = await mustBe(t, (x) => isDay(2, 'DAY_VOTE')(x) || isNight(2)(x), '2일 투표·밤');
        if (g.phase === 'DAY') await t.advance();
        await day.waitState(t, isNight(2));
        await calmAll(t, { bar: 2 });
    }],
    // 3일 낮 → 투표 → 재판(봇 X), 봇 둘이 재판 중 채팅
    ['tribunal3', async (s, t) => {
        const { cast } = s.state;
        await mustBe(t, isNight(2), '2일 밤');
        await closeStatus(cast.me.page);
        await night.toDay(t, { dayIndex: 3 });
        await calmAll(t, { bar: 3 });
        await botsToTribunal(s, t);
        for (const h of t.humans) await K4.calm(h.page);
        await botSay(t, cast.ally, '재판 중에 한마디 합니다');
        await botSay(t, cast.citizens[0], '저는 억울합니다');
    }],
    // 재판 봇 무죄 → 3일 밤: 나(광대)가 화면으로 귀족 봇 암살 + 광대 동료 봇도 같은 사람, 의사 봇은 다른 사람 → 경비원 차례
    // 경비원(사람) 조사는 창 없는 모드만 도구가 누름 (다 내면 5초 뒤 밤이 끝나서, 창 보이는 모드는 사람이 직접 누르고 그 흐름을 봄)
    ['night3', async (s, t) => {
        const { cast } = s.state;
        await mustBe(t, (g) => g.phase === 'TRIBUNAL' && g.dayIndex === 3, '3일 재판');
        await botsAcquit(s, t);
        await calmAll(t, { bar: 3 });
        const victim = cast.citizens[1];
        s.state.victim = victim;
        await night.toTurn(t, 'JOKER', { dayIndex: 3 });
        await K5.actUi(cast.me.page, nick(victim), '암살');
        await K5.botAct(t, cast.ally, victim);
        await night.toTurn(t, 'DOCTOR', { dayIndex: 3 });
        await K5.botAct(t, cast.doctor, cast.citizens[2]);
        await night.toTurn(t, 'GUARD', { dayIndex: 3 });
        if (s.headless) await K5.actUi(cast.guard.page, nick(cast.ally), '조사');
        else await calm(cast.guard.page, { quietMs: 800, timeoutMs: 8000 });
        await calm(cast.me.page, { quietMs: 800, timeoutMs: 8000 });
    }],
    // 3일 밤 끝 → 4일 낮: 암살 영상(또는 그 글 창)이 뜬 채로 둠 (닫지 않음) — 사람이 경비원 조사를 눌러 이미 낮이 됐으면 그대로
    ['dawn4', async (s, t) => {
        const { cast } = s.state;
        const g = await mustBe(t, (x) => isNight(3)(x) || isDay(4)(x), '3일 밤·4일 낮');
        if (g.phase === 'NIGHT') await night.toDay(t, { dayIndex: 4 });
        await night.waitDead(t, uid(s.state.victim));
        const shown = await cast.me.page.locator(DAWN_SHOW).first().waitFor({ state: 'attached', timeout: 20_000 }).then(() => true, () => false);
        if (!shown) s.note('암살 영상이 이미 지나감 → 다시 보려면 again (처음부터 이 자리까지, 1~2분)');
    }],
    // 4일 낮 토론: 영상·글 창·밤 결과 창·안내를 다 닫음
    ['day4', async (s, t) => {
        await mustBe(t, isDay(4, 'DAY_DISCUSSION'), '4일 낮 토론');
        await calmAll(t, { bar: 4, timeoutMs: 45_000 });
    }],
];
const STEP_NAMES = STEPS.map(([name]) => name);

/** 판을 그 자리까지 차례대로 굴림 (이미 지난 자리면 아무것도 안 함) → Table */
async function reach(s, name) {
    const t = s.state.table;
    const target = STEP_NAMES.indexOf(name);
    if (target < 0) throw new Error(`모르는 자리: ${name}`);
    while ((s.state.step ?? 0) < target) {
        const next = (s.state.step ?? 0) + 1;
        await STEPS[next][1](s, t);
        s.state.step = next;
    }
    return t;
}

/** still용: 서버 판이 아직 그 자리인지 */
const at = (match) => async (s) => {
    const g = await s.state.table?.state();
    return Boolean(g && match(g));
};

module.exports = {
    PLANS, DAWN_SHOW, sleep, uid, nick,
    seatPlan, startPlan, seatSize, startSize, table, reach, at, isDay, isNight,
    calm, calmAll, botSay, openStatus, closeStatus, openCloseup, closeCloseup, abstainUi, settleShown, palette, openPalette,
    day, night, chat, K4, K5,
};
