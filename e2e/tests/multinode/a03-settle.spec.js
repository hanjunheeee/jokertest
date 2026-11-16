'use strict';

// 서버 2대 낮 5초 브라우저 시험 (어려움) — 판 서버가 아닌 쪽 로비에서 들어온 사람(PC 2·모바일 2)도 "[5초 뒤 마감]"·결과를 받음
// 목록 A03-낮투표.md 번호 A03-H-022·040, E2E_NODES=2에서만 돎 — 5초 규칙이라 손잡이로 안 넘기고 진짜로 기다림(@realtime)
const mn = require('./_mn');
const { ui } = require('../../helpers/fixtures');
const { Table, fitMaxPlayers } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const L = require('../ingame/a-day/_lib');

const { test, expect, e2e, NODE_IDS } = mn;
// 판(방)은 첫 서버, 사람은 둘째 서버 로비에서 출발
const [GAME_NODE, OTHER_NODE] = NODE_IDS;

// 결과 값 → 현황 창 글 (PC InGameVoteStatusContent.jsx·모바일 VoteStatusContent.jsx 같은 글)
const OUTCOME_LABEL = Object.freeze({ TRIBUNAL: '재판 회부', TIE: '동점', ABSTAIN_MAJORITY: '기권이 많아 재판 없음', ABSTAINED: '전원 기권' });
// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5)
const SLACK_MS = 1500;

const U = (x) => x.account.uuid;
const nickOf = (t, uuid) => [...t.bots, ...t.humans].find((x) => U(x) === uuid).account.nickname;

// 자동 구성대로 직업 고정: 사람 시민, 둘째 봇 광대, 그다음 봇부터 의사(6명~)·경비원(8명~)·마녀사냥꾼(10명), 나머지 시민
function rolesFor(n, humans, bots) {
    const special = ['JOKER', ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
    const out = {};
    for (const h of humans) out[U(h)] = 'CITIZEN';
    bots.forEach((b, i) => { out[U(b)] = special[i - 1] ?? 'CITIZEN'; });
    return out;
}

// 봇 전부 판 서버, 사람은 다른 서버 로비 → 코드로 입장·준비 → 직업 정하고 시작 (Table로 감싸 손잡이 그대로 씀)
async function crossNodeTable({ bots, onNode, botCount, people, mobile }) {
    const list = await mn.botsOn(bots, botCount, GAME_NODE);
    const host = list[0];
    const humans = [];
    for (let i = 0; i < people; i += 1) humans.push(await onNode.person(OTHER_NODE, { mobile }));
    const n = botCount + people;
    const room = await host.createRoom({ maxPlayers: fitMaxPlayers(n) });
    for (const b of list.slice(1)) await b.joinByCode(room.roomCode);
    for (const h of humans) await ui.joinRoomByCodeUi(h.page, room.roomCode);
    const live = await e2e.roomOf(U(host));
    for (const b of list) await b.setReady(room.roomId, live.settingsVersion);
    for (const h of humans) await ui.readyUi(h.page);
    const roles = rolesFor(n, humans, list);
    await e2e.setRoles(roles, { roomId: room.roomId });
    const started = await host.startGame(room.roomId, live.settingsVersion);
    for (const h of humans) await expect(h.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    const t = new Table({ room, bots: list, humans });
    t.gameId = started.gameId;
    const s = await t.state();
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(roles[p.uuid]);
    // 판은 판 서버에서 돎 (사람이 출발한 서버와 다름)
    expect(await mn.gameNodeOf(U(host))).toBe(GAME_NODE);
    return t;
}

// 표 목록을 사람마다 나눔 (자기 자신 찍는 표는 안 줌), fixed는 미리 정한 사람 표 → Map(uuid → 대상, null = 기권)
function assignBallots(voters, list, fixed = {}) {
    const left = [...list];
    const out = new Map();
    for (const [u, b] of Object.entries(fixed)) {
        const at = left.indexOf(b);
        if (at < 0) throw new Error('정한 표가 표 모양에 없음');
        left.splice(at, 1);
        out.set(u, b);
    }
    const rest = voters.filter((u) => !out.has(u));
    const place = (i) => {
        if (i === rest.length) return true;
        for (let k = 0; k < left.length; k += 1) {
            const b = left[k];
            if (b === rest[i]) continue;
            left.splice(k, 1);
            out.set(rest[i], b);
            if (place(i + 1)) return true;
            left.splice(k, 0, b);
            out.delete(rest[i]);
        }
        return false;
    };
    if (rest.length !== left.length || !place(0)) throw new Error('표 모양을 못 나눔');
    return out;
}

// 봇이 받은 알림 한 줄 기다림 → { event, payload, at(받은 시각) }
async function eventRow(bot, event, { since, match = () => true, timeout = 15000 }) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 토론은 손잡이로 넘김(앞 단계) → 투표 열림, 사람 화면에 기권 단추까지
async function openVote(t) {
    const since = Date.now();
    await t.advance();
    await eventRow(t.bots[0], 'day_phase_changed', { since, match: (p) => p.dayIndex === 1 && p.dayPhase === 'DAY_VOTE' });
    for (const h of t.humans) await expect(h.page.getByRole('button', { name: '기권' })).toBeVisible();
    return since;
}

// 봇 표 먼저 → 사람 표(PC는 카드 메뉴 "투표하기", 기권은 단추) 차례로 → 마지막 사람 표가 받아진 시각
async function castAll(t, plan) {
    for (const bot of t.bots) {
        const r = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: plan.get(U(bot)) });
        expect(r?.ok, `봇 낮 표 거절: ${r?.code}`).toBe(true);
    }
    for (const h of t.humans) {
        const target = plan.get(U(h));
        if (target === null) {
            const abstain = h.page.getByRole('button', { name: '기권' });
            await abstain.click();
            await expect(abstain).toBeDisabled();
        } else {
            await L.voteUi(h.page, nickOf(t, target));
        }
    }
    return Date.now();
}

// 당김 알림 마감 = 다 찬 때+5초, 판정은 5초(±1.5) 뒤 → 판정 알림 값
async function expectServerSettle(t, { since, filledAt }) {
    const settle = await eventRow(t.bots[0], 'phase_settle_started', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1, timeout: 4000 });
    expect(Math.abs(settle.payload.deadline - filledAt - 5000), '당긴 마감 = 다 찬 때+5초').toBeLessThanOrEqual(SLACK_MS);
    const resolved = await eventRow(t.bots[0], 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1 });
    expect(Math.abs(resolved.at - filledAt - 5000), `다 찬 뒤 ${resolved.at - filledAt}ms에 판정`).toBeLessThanOrEqual(SLACK_MS);
    return resolved.payload;
}

// 판정 뒤 현황 창 결과 글 (밤 안내 같은 연출 창이 덮으면 닫고 다시 엶)
async function expectStatus(page, outcome) {
    const dialog = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        if (!(await dialog.isVisible())) {
            await ui.closeOverlays(page);
            await page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 2000 });
        }
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    const out = dialog.getByTestId('vote-status-outcome');
    await expect(out).toHaveText(OUTCOME_LABEL[outcome]);
    await expectReadable(out);
}

test('A03-H-022 서버 2대 6명 판, 다른 서버 로비에서 온 PC 사람 2 → 두 화면 다 "[5초 뒤 마감]"·남은 초 5 이하·결과 "동점" @game @hard @realtime @smoke', async ({ bots, onNode }) => {
    test.setTimeout(240_000);
    const t = await crossNodeTable({ bots, onNode, botCount: 4, people: 2, mobile: false });
    const [h0, h1] = t.humans;
    const X = U(t.bots[2]);
    const Y = U(t.bots[3]);
    // X 3·Y 3: 사람 하나는 X, 하나는 Y (사람이 마지막 둘)
    const plan = assignBallots([...t.humans, ...t.bots].map(U), [X, X, X, Y, Y, Y], { [U(h0)]: X, [U(h1)]: Y });
    await L.toDay(t);
    const since = await openVote(t);
    const filledAt = await castAll(t, plan);

    // 5초 안에 두 화면 다 확인 (시간 줄 확대 자리 시계·당김 글)
    await Promise.all(t.humans.map(async (h) => {
        await expect.poll(async () => {
            const text = await h.page.getByRole('timer').first().innerText({ timeout: 500 }).catch(() => '');
            const m = text.match(/(\d+):(\d+)/);
            return m ? Number(m[1]) * 60 + Number(m[2]) : 99;
        }, { timeout: 3000, message: '남은 초 5 이하' }).toBeLessThanOrEqual(5);
        await expectReadable(h.page.getByText('[5초 뒤 마감]').first(), { timeout: 3000 });
    }));
    const resolved = await expectServerSettle(t, { since, filledAt });
    expect(resolved.outcome).toBe('TIE');
    for (const h of t.humans) {
        await expect(h.page.getByRole('dialog', { name: '재판' })).toHaveCount(0);
        await expectStatus(h.page, 'TIE');
    }
});

test('A03-H-040 서버 2대 7명 판, 다른 서버 로비에서 온 모바일 사람 2 → 두 화면 다 단계 줄 "5초 뒤 마감"·결과 "기권이 많아 재판 없음" @game @hard @realtime', async ({ bots, onNode }) => {
    test.setTimeout(240_000);
    const t = await crossNodeTable({ bots, onNode, botCount: 5, people: 2, mobile: true });
    const X = U(t.bots[2]);
    // X 2·기권 5: 봇 둘만 X, 사람 둘은 기권 단추 (사람이 마지막 둘)
    const fixed = Object.fromEntries(t.humans.map((h) => [U(h), null]));
    const plan = assignBallots([...t.humans, ...t.bots].map(U), [X, X, null, null, null, null, null], fixed);
    await L.toDay(t);
    const since = await openVote(t);
    const filledAt = await castAll(t, plan);

    // 모바일(세로)은 위 단계 줄에 "5초 뒤 마감 0:0n" 한 줄 (펼친 진행 바는 접혀 있음)
    await Promise.all(t.humans.map(async (h) => {
        const line = h.page.locator('[data-talk-phase-line]');
        await expect(line).toContainText('5초 뒤 마감', { timeout: 3000 });
        await expect(line).toContainText(/0:0[0-5]/, { timeout: 3000 });
        await expectReadable(line, { timeout: 3000 });
    }));
    const resolved = await expectServerSettle(t, { since, filledAt });
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    for (const h of t.humans) {
        await expect(h.page.getByRole('dialog', { name: '재판' })).toHaveCount(0);
        await expectStatus(h.page, 'ABSTAIN_MAJORITY');
    }
});
