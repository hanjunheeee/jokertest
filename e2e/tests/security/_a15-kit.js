'use strict';

// A15 보안 브라우저 시험 도우미 파일, 화면 소켓이 받은 값 모으기·남의 직업 샌 곳 찾기·화면 소켓으로 직접 보내기·남의 사이트 페이지·따로 띄운 서버로 화면 돌리기
// tests/security/a15-*.spec.js·tests/mobile/a15-*.spec.js만 씀 (공용 도우미는 안 고치고 여기에 작게 둠, 시험 파일 아님)
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { E2E, BACKEND_DIR } = require('../../helpers/env');
const ui = require('../../helpers/ui');
const n = require('../ingame/b-night/_night');
const { listenOnFetchablePort } = require(path.join(BACKEND_DIR, 'tests', 'helpers', 'fetchablePort'));

// 화면에 나오는 직업 이름 (결과판은 시민을 "귀족"으로, 서버 옛 이름 "주치의"도 같이 봄)
const ROLE_TEXTS = Object.freeze(['광대', '시민', '귀족', '의사', '주치의', '경비원', '마녀사냥꾼']);
const ROLE_CODES = new Set(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']);

// ---------- 화면 소켓이 받은 글 모으기 ----------

/**
 * socket.io 글 한 줄 읽기: 42["이름",{값}] = 알림, 43<번호>[{답}] = 내 요청의 답
 * @example parseFrame('42["night_result_applied",{"gameId":"g1"}]') // { kind: 'event', event: 'night_result_applied', data: { gameId: 'g1' } }
 */
function parseFrame(payload) {
    if (typeof payload !== 'string' || payload.length < 3 || payload[0] !== '4') return null;
    const type = payload[1];
    if (type !== '2' && type !== '3') return null;
    let rest = payload.slice(2);
    // 방 이름(/abc,)이 붙은 글은 이름 뗌
    if (rest.startsWith('/')) rest = rest.slice(rest.indexOf(',') + 1);
    const m = rest.match(/^(\d*)([[{].*)$/s);
    if (!m) return null;
    let body;
    try { body = JSON.parse(m[2]); } catch { return null; }
    if (!Array.isArray(body)) return null;
    if (type === '2') return { kind: 'event', event: String(body[0]), data: body[1], ackId: m[1] || null, raw: payload };
    return { kind: 'ack', event: `답#${m[1]}`, data: body[0], ackId: m[1], raw: payload };
}

/**
 * 화면(page)이 연 게임 소켓이 받은 글 전부 모으기 → 배열 (계속 쌓임, [{ kind, event, data, raw, at }])
 * 판에 들어가기 전에 걸어 둠 (코드 입장 화면을 새로 열 때 소켓도 새로 열림 → 그 소켓부터 잡힘)
 */
function watchFrames(page) {
    const list = [];
    // 잡은 소켓 수 (0이면 모은 게 비어도 뜻이 없음)
    list.sockets = 0;
    page.on('websocket', (ws) => {
        if (!ws.url().includes('/socket.io/')) return;
        list.sockets += 1;
        ws.on('framereceived', ({ payload }) => {
            const frame = parseFrame(typeof payload === 'string' ? payload : payload.toString('utf8'));
            if (frame) list.push({ ...frame, at: Date.now() });
        });
    });
    return list;
}

// 판 끝 값(모두의 직업 winResult.reveals)이 처음 실린 글 차례, 없으면 -1
const endIndexOf = (list) => list.findIndex((f) => f.raw.includes('"reveals"'));

/** 판 시작 알림부터 판 끝 값 바로 앞까지 (판 끝 뒤 결과판 값은 모두에게 공개라 뺌) */
function inGameFrames(list) {
    const start = list.findIndex((f) => f.event === 'game_started');
    const end = endIndexOf(list);
    return list.slice(Math.max(0, start), end < 0 ? list.length : end);
}

/** 그 알림이 화면에 올 때까지 (서버 단계가 먼저 바뀌고 글은 조금 뒤에 옴) */
async function waitFrame(list, event, { timeout = 15_000 } = {}) {
    await expect.poll(() => list.some((f) => f.event === event), { timeout, message: `화면이 "${event}" 알림을 받음` }).toBe(true);
}

/** 판 하나와 닿는 글 (판 id나 판 사람 uuid가 든 글) — 판 밖 사람은 0개여야 함 */
const framesAbout = (list, { gameId, uuids }) => list.filter((f) => f.raw.includes(gameId) || uuids.some((u) => f.raw.includes(u)));

// 차례 알림의 맨 위 role 칸 = 지금 누구 차례인지 직업 이름 (사람과 안 묶임, 전원에게 같은 값)
const TURN_EVENTS = new Set(['night_turn_started', 'night_turn_ended', 'phase_settle_started']);
// 남에게 가면 안 되는 칸 이름 (내 칸 self 밖에서)
const PRIVATE_KEYS = new Set([
    'role', 'team', 'allies', 'votes', 'nightActions', 'dayVotes', 'roleRevealAcks',
    'nightTargetUuid', 'dayVoteTargetUuid', 'tribunalVoteUuid', 'tribunalVote',
]);
// 직업 이름과 같은 글이 와도 되는 자리 (사람 uuid·결과 이름 칸)
const OPEN_PATHS = new Set([
    'players.*.uuid', 'nightResult.victimUuid', 'nightResult.deathReveals.*.victimUuid', 'nightResult.deathReveals.*.source',
    'dayVoteResolution.tribunalTargetUuid', 'tribunal.defendantUuid', 'tribunal.executedUuid', 'tribunal.outcome', 'winResult.winner',
]);
const pathKey = (p) => p.map((s) => (typeof s === 'number' ? '*' : s)).join('.');

// 받은 값에서 "남에게 보여도 되는 칸"만 남긴 사본 (내 칸 self, 차례 직업 이름, 지금 차례 이름, 죽인 쪽 이름은 뺌), 남의 self면 문제로 적음
function publicCopy(frame, viewer, problems) {
    const walk = (value, at) => {
        if (Array.isArray(value)) return value.map((x, i) => walk(x, [...at, i]));
        if (value === null || typeof value !== 'object') return value;
        const out = {};
        for (const [key, val] of Object.entries(value)) {
            if (key === 'self') {
                if (val?.uuid !== undefined && val.uuid !== viewer) problems.push(`${frame.event} ${[...at, key].join('.')}: 남의 self`);
                continue;
            }
            if (key === 'nightTurnRole') continue;
            if (key === 'source' && at.at(-2) === 'deathReveals') continue;
            if (key === 'role' && at.length === 0 && TURN_EVENTS.has(frame.event)) continue;
            out[key] = walk(val, [...at, key]);
        }
        return out;
    };
    return walk(frame.data, []);
}

// 숨길 칸 이름이 있거나, 남의 직업 이름과 같은 글이 열린 자리 밖에 있으면 문제
function privateProblems(value, secrets, label, at, problems) {
    if (Array.isArray(value)) { value.forEach((x, i) => privateProblems(x, secrets, label, [...at, i], problems)); return; }
    if (value !== null && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
            if (PRIVATE_KEYS.has(key)) problems.push(`${label} ${[...at, key].join('.')}: 숨길 칸 "${key}"`);
            privateProblems(val, secrets, label, [...at, key], problems);
        }
        return;
    }
    if (typeof value === 'string' && secrets.has(value) && !OPEN_PATHS.has(pathKey(at))) {
        problems.push(`${label} ${at.join('.') || '(맨 위)'}: 남의 직업 이름 "${value}"`);
    }
}

// 한 칸 묶음 안에 남의 uuid와 직업 이름이 같이 있으면 짝으로 샌 것
function pairProblems(value, others, label, at, problems) {
    if (Array.isArray(value)) { value.forEach((x, i) => pairProblems(x, others, label, [...at, i], problems)); return; }
    if (value === null || typeof value !== 'object') return;
    const vals = Object.values(value);
    const who = vals.find((v) => typeof v === 'string' && others.has(v));
    const role = vals.find((v) => typeof v === 'string' && ROLE_CODES.has(v));
    if (who && role) problems.push(`${label} ${at.join('.') || '(맨 위)'}: ${who}와 ${role}가 같이 실림`);
    for (const [k, v] of Object.entries(value)) pairProblems(v, others, label, [...at, k], problems);
}

/**
 * 받은 글에서 남의 직업이 샌 곳 목록 (빈 배열이면 안 샘) — 동료(같은 직업, 시민 빼고)는 알아도 됨
 * 재판 결과 알림(tribunal_vote_resolved)엔 처형된 사람 직업(executedRole)·표 수(counts) 칸도 없어야 함 (결정 2026-11-16 아침 1번)
 * @param {object[]} frames watchFrames가 모은 글 (보통 inGameFrames로 자른 것)
 * @param {{ viewer:string, roles:Record<string,string>, allies?:Iterable<string> }} o roles = 판 사람 uuid → 직업 (서버 판 요약에서)
 */
function leaksFor(frames, { viewer, roles, allies = [] }) {
    const mates = new Set(allies);
    const others = new Set(Object.keys(roles).filter((u) => u !== viewer && !mates.has(u)));
    const secrets = new Set([...others].map((u) => roles[u]));
    const problems = [];
    for (const frame of frames) {
        if (frame.event === 'tribunal_vote_resolved' && frame.data && typeof frame.data === 'object') {
            for (const key of ['executedRole', 'counts']) {
                if (Object.hasOwn(frame.data, key)) problems.push(`tribunal_vote_resolved: 칸 "${key}"가 실림`);
            }
        }
        const copy = publicCopy(frame, viewer, problems);
        privateProblems(copy, secrets, frame.event, [], problems);
        pairProblems(copy, others, frame.event, [], problems);
    }
    return [...new Set(problems)];
}

/** 받은 글 안 동료 목록(allies)을 전부 모음 → [[uuid…], …] */
function alliesSeen(frames) {
    const found = [];
    const walk = (v) => {
        if (Array.isArray(v)) { v.forEach(walk); return; }
        if (!v || typeof v !== 'object') return;
        for (const [k, val] of Object.entries(v)) {
            if (k === 'allies') found.push((Array.isArray(val) ? val : [val]).map((a) => (typeof a === 'string' ? a : a?.uuid)));
            walk(val);
        }
    };
    for (const f of frames) walk(f.data);
    return found;
}

/** 판 요약에서 { uuid: 직업 } */
const rolesOf = (s) => Object.fromEntries(s.players.map((p) => [p.uuid, p.role]));

/** 내 동료 uuid (같은 직업 남, 시민은 동료 없음 — 결정 "누가 보나") */
function sameRoleMates(s, uuid) {
    const me = s.players.find((p) => p.uuid === uuid);
    if (!me || me.role === 'CITIZEN') return [];
    return s.players.filter((p) => p.uuid !== uuid && p.role === me.role).map((p) => p.uuid).sort();
}

/**
 * 한 사람 자리에서 받은 판 글 전부 확인: 남의 직업 없음 + 동료 목록이 같은 직업 남만 + 재판·밤 결과를 실제로 받았는지(빈 기록으로 통과 막기)
 * @param {object[]} list watchFrames 배열
 * @param {any} s 판 요약 (직업 비교용)
 * @param {string} viewer
 * @param {{ needTribunal?: boolean, needNight?: boolean }} [o]
 */
function expectNoLeak(list, s, viewer, { needTribunal = true, needNight = true } = {}) {
    const frames = inGameFrames(list);
    expect(frames.some((f) => f.event === 'game_started'), '판 시작 알림을 받음').toBe(true);
    if (needTribunal) expect(frames.some((f) => f.event === 'tribunal_vote_resolved'), '재판 결과 알림을 받음').toBe(true);
    if (needNight) expect(frames.some((f) => f.event === 'night_result_applied'), '밤 결과 알림을 받음').toBe(true);
    const mates = sameRoleMates(s, viewer);
    const lists = alliesSeen(frames);
    if (mates.length > 0) expect(lists.length, '동료 목록을 한 번은 받음').toBeGreaterThan(0);
    for (const allies of lists) expect([...allies].filter(Boolean).sort(), '동료 목록 = 같은 직업 남만').toEqual(mates);
    expect(leaksFor(frames, { viewer, roles: rolesOf(s), allies: mates }), '남의 직업이 샌 곳').toEqual([]);
}

// ---------- 판 흐름 ----------

/**
 * 1일 낮 X 처형(봇 표) → 1일 밤 광대 봇이 V 암살 → 2일 낮 시작까지 (그 밖의 밤 행동은 안 함)
 * 사람은 아무것도 안 냄(기권) — X가 봇이면 X는 다른 봇을 찍어 X 표가 기권보다 많게 함
 * @param {*} t 판 (n.setup 결과)
 * @param {{ execute:string, victim?:string|null }} o uuid
 * @returns {Promise<any>} 2일 낮 판 요약
 */
async function playDayNight(t, { execute, victim = null }) {
    const s = await playScript(t, { executes: { 1: execute }, kills: victim ? { 1: victim } : {}, until: (x) => x.phase === 'DAY' && x.dayIndex === 2 });
    expect(s?.phase, '2일 낮까지 감 (판이 먼저 끝나지 않음)').toBe('DAY');
    expect(n.rowOf(s, execute)?.alive, '1일 처형됨').toBe(false);
    if (victim) expect(n.rowOf(s, victim)?.alive, '1일 밤 암살됨').toBe(false);
    return s;
}

/**
 * 날마다 정한 대로 봇이 움직이게 하고 조건까지 단계 넘기기 (끝나면 봇 멈춤)
 * executes: { 날: 처형할 uuid } — 그 날 봇 전부 그 사람을 찍고 유죄 (그 사람이 봇이면 다른 봇을 찍어 표가 기권보다 많게)
 * kills: { 밤(날 번호): 암살할 uuid } — 광대 봇만, 그 밖의 밤 행동은 안 함
 * @example playScript(t, { executes: { 1: c1, 2: joker }, until: (s) => s.phase === 'ENDED' })
 */
async function playScript(t, { executes = {}, kills = {}, until }) {
    const botIds = new Set(t.bots.map((b) => b.account.uuid));
    t.playBots(() => ({
        readyForVote: true,
        dayVote: (ctx) => {
            const target = executes[ctx.snapshot.dayIndex];
            if (!target) return undefined;
            if (ctx.me.uuid !== target) return target;
            return ctx.others.find((o) => o.uuid !== target && botIds.has(o.uuid))?.uuid ?? null;
        },
        tribunal: 'GUILTY',
        night: (ctx) => (ctx.me.role === 'JOKER' ? kills[ctx.snapshot.dayIndex] : undefined),
    }));
    const s = await n.advanceUntilSettled(t, until, { maxSteps: 90, allowEnd: true });
    await t.stopBots();
    return s;
}

/**
 * 직업을 정해 판 차리기 (밤 도우미 n.setup) + 사람 화면이 바뀌지 않았는지 (바뀌면 모은 글이 끊겨 다시 돌림)
 * @returns {Promise<{ t:any, s:any }>}
 */
async function setupGame(table, { humans, bots, counts, humanRoles = [], botRoles = [], extra = {} }) {
    const pages = humans.map((h) => h.page);
    const t = await n.setup(table, { humans, bots, settings: n.custom(counts, { nightActionTime: 120, dayDiscussionTime: 150, ...extra }), humanRoles, botRoles });
    humans.forEach((h, i) => {
        if (h.page !== pages[i]) throw new Error('판 차리다 사람 창이 새로 바뀜 → 모은 글이 끊김 (다시 돌리기)');
    });
    const s = await t.state();
    humanRoles.forEach((role, i) => expect(n.rowOf(s, humans[i].account.uuid)?.role, `사람 ${i} 직업`).toBe(role));
    botRoles.forEach((role, i) => { if (role) expect(n.rowOf(s, t.bots[i].account.uuid)?.role, `봇 ${i} 직업`).toBe(role); });
    return { t, s };
}

/**
 * 사람 자리 하나: 직업 정해 판 차리기 → 1일 X 처형 → 1일 밤 V 암살 → 2일 낮 → 받은 글 전부에 남의 직업 없음
 * execute·victim: 'me'(사람) 또는 봇 차례 번호, victim null이면 암살 없음(광대가 사람뿐인 판)
 */
async function seatCase(table, user, { counts, me, botRoles, execute, victim }) {
    const frames = watchFrames(user.page);
    const { t } = await setupGame(table, { humans: [user], bots: botRoles.length, counts, humanRoles: [me], botRoles });
    const who = (x) => (x === 'me' ? user.account.uuid : t.bots[x].account.uuid);
    const s = await playDayNight(t, { execute: who(execute), victim: victim === null ? null : who(victim) });
    await waitFrame(frames, 'night_result_applied');
    expectNoLeak(frames, s, user.account.uuid);
    return { t, s, frames };
}

/** 판 밖 사람: 로비에 있는 사람 옆에서 봇끼리 같은 꼴 판 → 로비 화면이 받은 판 글 0개 */
async function outsiderCase(table, user, { counts, botRoles, execute, victim }) {
    const frames = watchFrames(user.page);
    // 로비를 새로 열어 소켓부터 잡음
    await ui.gotoLobby(user.page);
    const { t } = await setupGame(table, { humans: [], bots: botRoles.length, counts, botRoles });
    const s = await playDayNight(t, { execute: t.bots[execute].account.uuid, victim: t.bots[victim].account.uuid });
    // 판 안 봇은 판 글을 받음 (판이 돌았는데 로비만 못 받은 것인지 확인)
    expect(n.eventsOf(t.bots[0], 'night_result_applied').length, '판 안 봇은 밤 결과를 받음').toBeGreaterThan(0);
    await expect(user.page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
    expect(frames.sockets, '로비 화면 소켓을 잡음').toBeGreaterThan(0);
    const about = framesAbout(frames, { gameId: t.gameId, uuids: s.players.map((p) => p.uuid) });
    expect(about.map((f) => f.event), '로비 화면이 받은 판 글').toEqual([]);
    return { t, s, frames };
}

/** 남의 카드 글에 직업 이름·"동료"가 없음 (내 동료 카드는 뺌) */
async function expectCardsHideRoles(page, nicknames) {
    for (const nick of nicknames) {
        const text = await n.cardStatus(page, nick).innerText();
        for (const word of [...ROLE_TEXTS, '동료']) expect(text, `${nick} 카드에 "${word}"`).not.toContain(word);
    }
}

// ---------- 화면 소켓으로 직접 보내기 ----------

/**
 * 화면이 여는 웹소켓을 잡아 둠 (다음 페이지 열기부터 먹음 → 건 뒤 페이지를 새로 엶)
 * 답 받는 요청은 큰 번호(7백만부터)를 써서 화면 자기 요청 번호와 안 겹침
 */
async function hookPageSocket(page) {
    await page.addInitScript(() => {
        if (window.__a15Net) return;
        const Native = window.WebSocket;
        const net = { sockets: [], replies: {}, closed: 0, nextId: 7000000 };
        window.__a15Net = net;
        window.WebSocket = class extends Native {
            constructor(...args) {
                super(...args);
                if (!String(args[0]).includes('/socket.io/')) return;
                net.sockets.push(this);
                this.addEventListener('message', (e) => {
                    const m = typeof e.data === 'string' ? e.data.match(/^43(\d+)([\s\S]*)$/) : null;
                    if (m && Number(m[1]) >= 7000000) net.replies[m[1]] = m[2];
                });
                this.addEventListener('close', () => { net.closed += 1; this.__a15Closed = true; });
            }
        };
    });
}

/** 잡아 둔 소켓이 지금 화면에 붙어 있는지 (판 차리다 창이 바뀌면 빠짐) */
async function expectSocketHooked(page) {
    await expect.poll(() => page.evaluate(() => (window.__a15Net?.sockets ?? []).some((ws) => ws.readyState === 1)), {
        timeout: 15_000, message: '화면 소켓 손잡이가 안 붙음 (창이 바뀜 — 다시 돌리기)',
    }).toBe(true);
}

/**
 * 화면 소켓으로 같은 요청 여러 번 보내고 답 모으기 (한 번에 다 보냄) → 답 배열 (못 받으면 { timeout: true })
 * @param {import('@playwright/test').Page} page
 * @param {string} event
 * @param {any[]} payloads
 */
async function pageEmitMany(page, event, payloads, { timeoutMs = 8000 } = {}) {
    return page.evaluate(async ({ event, payloads, timeoutMs }) => {
        const net = window.__a15Net;
        const ws = [...(net?.sockets ?? [])].reverse().find((s) => s.readyState === 1);
        if (!ws) throw new Error('열린 화면 소켓 없음');
        const ids = payloads.map((p) => {
            net.nextId += 1;
            const id = String(net.nextId);
            ws.send(`42${id}${JSON.stringify([event, p])}`);
            return id;
        });
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline && ids.some((id) => net.replies[id] === undefined)) {
            await new Promise((r) => setTimeout(r, 50));
        }
        return ids.map((id) => {
            if (net.replies[id] === undefined) return { timeout: true };
            try { return JSON.parse(net.replies[id])[0]; } catch { return { unreadable: net.replies[id] }; }
        });
    }, { event, payloads, timeoutMs });
}

/** 화면 소켓으로 요청 하나 → 답 */
const pageEmit = async (page, event, payload, o) => (await pageEmitMany(page, event, [payload], o))[0];

/** 화면 소켓으로 글 그대로 보내기 (답 안 기다림) → 보낸 소켓 차례 */
async function pageSendRaw(page, frames) {
    return page.evaluate((list) => {
        const net = window.__a15Net;
        const sockets = net?.sockets ?? [];
        const index = sockets.map((s) => s.readyState).lastIndexOf(1);
        if (index < 0) throw new Error('열린 화면 소켓 없음');
        for (const text of list) sockets[index].send(text);
        return index;
    }, frames);
}

/** 그 차례 소켓이 닫혔는지 */
const socketClosed = (page, index) => page.evaluate((i) => Boolean(window.__a15Net?.sockets?.[i]?.__a15Closed), index);

// ---------- 브라우저 저장소 ----------

/** localStorage·sessionStorage 값 전부 → [{ area, key, value }] */
const storageDump = (page) => page.evaluate(() => {
    const out = [];
    for (const [area, store] of [['local', window.localStorage], ['session', window.sessionStorage]]) {
        for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i);
            out.push({ area, key, value: store.getItem(key) ?? '' });
        }
    }
    return out;
});

// JWT(로그인 토큰) 모양 글: 점 둘로 나뉜 base64url 세 덩이, 첫 덩이가 eyJ로 시작
const JWT_SHAPE = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/;

/** 저장소에 토큰·비번 글자가 없는지 (쿠키 값 그대로·JWT 모양·비번 글자) */
async function expectStorageClean(page, { secrets = [] } = {}) {
    const rows = await storageDump(page);
    for (const row of rows) {
        const where = `${row.area}Storage "${row.key}"`;
        expect(JWT_SHAPE.test(row.value), `${where}에 토큰 모양 글`).toBe(false);
        for (const s of secrets.filter((x) => typeof x === 'string' && x.length >= 6)) {
            expect(row.value.includes(s) || row.key.includes(s), `${where}에 숨길 글자`).toBe(false);
        }
    }
    return rows;
}

// ---------- 남의 사이트 (목록 밖 주소) ----------

/**
 * 목록 밖 주소 페이지를 이 시험 안에서 띄움 (127.0.0.1 높은 포트, 우리 컴퓨터 안) → { origin, url(path), close }
 * pages: { '/경로': 'HTML 글' } — 화면 주소(localhost)와 다른 사이트로 셈 (주소 이름이 다름)
 */
async function startOutsideSite(pages) {
    const server = http.createServer((req, res) => {
        const html = pages[new URL(req.url, 'http://x').pathname];
        if (html === undefined) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('없음'); return; }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
    });
    const { url } = await listenOnFetchablePort(server, { host: '127.0.0.1' });
    return {
        origin: url,
        url: (p) => `${url}${p}`,
        close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
    };
}

// ---------- 따로 띄운 서버로 화면 돌리기 (요청 수 제한) ----------

/** 시험마다 다른 접속 ip (nginx 한 단계 뒤 꼴 X-Forwarded-For 맨 끝에 넣음) → 예: '10.37.201.9' */
const uniqueIp = () => `10.${crypto.randomInt(256)}.${crypto.randomInt(256)}.${1 + crypto.randomInt(254)}`;

/**
 * 화면이 시험 백엔드(4100)로 보내는 HTTP 요청을 따로 띄운 서버로 돌림 + 접속 ip를 이 시험 것으로 (소켓은 그대로 4100)
 * 화면 빌드본은 API 주소가 4100으로 박혀 있어서, 운영 기본 제한 서버를 화면으로 보려면 길을 바꿔야 함
 */
async function pointApiAt(page, serverUrl, { ip }) {
    const target = new URL(serverUrl);
    await page.route((url) => url.origin === E2E.apiUrl, async (route) => {
        const req = route.request();
        const to = new URL(req.url());
        to.host = target.host;
        const headers = Object.fromEntries(Object.entries(await req.allHeaders()).filter(([k]) => !k.startsWith(':') && k !== 'host'));
        headers['x-forwarded-for'] = ip;
        await route.continue({ url: to.toString(), headers });
    });
}

module.exports = {
    ROLE_TEXTS, parseFrame, watchFrames, waitFrame, inGameFrames, framesAbout, leaksFor, alliesSeen, rolesOf, sameRoleMates, expectNoLeak,
    playDayNight, playScript, setupGame, seatCase, outsiderCase, expectCardsHideRoles,
    hookPageSocket, expectSocketHooked, pageEmit, pageEmitMany, pageSendRaw, socketClosed,
    storageDump, expectStorageClean, JWT_SHAPE, startOutsideSite, uniqueIp, pointApiAt, n,
};
