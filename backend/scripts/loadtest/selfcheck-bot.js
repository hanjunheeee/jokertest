// 부하 봇 자가 점검 파일, 서버 없이 봇이 단계마다 무엇을 보내는지·답을 어떻게 세는지 확인
// selfcheck.js와 같이 돌림: backend 폴더에서 node --test scripts/loadtest/selfcheck.js scripts/loadtest/selfcheck-bot.js
const test = require("node:test");
const assert = require("node:assert/strict");

const { Stats } = require("./stats");
const { Bot } = require("./bot");

// 요청을 적기만 하는 봇 (소켓 없음), answers = 사건 이름 → 답
function recordingBot({ answers = {} } = {}) {
    const stats = new Stats();
    const bot = new Bot({ origin: "http://127.0.0.1:4100", account: { email: "x", password: "y" }, index: 1, stats });
    bot.sent = [];
    bot.request = async (event, payload) => {
        bot.sent.push({ event, payload });
        const answer = answers[event];
        return typeof answer === "function" ? answer(payload) : (answer ?? { ok: true });
    };
    return bot;
}

const P = (uuid, isAlive = true) => ({ uuid, isAlive, isParticipating: true });
const snapshot = (over) => ({
    phase: "DAY", dayIndex: 1, dayPhase: "DAY_DISCUSSION",
    players: [P("me"), P("a"), P("b"), P("c"), P("d", false)],
    self: { uuid: "me", role: "CITIZEN" },
    ...over,
});

test("봇: 낮 토론엔 (채팅 +) 투표 준비, 같은 단계에 두 번 안 보냄", async () => {
    const bot = recordingBot();
    const done = new Set();
    await bot.act("g1", snapshot(), done, 1);
    await bot.act("g1", snapshot(), done, 1);
    assert.deepEqual(bot.sent.map((s) => s.event), ["submit_game_chat_message", "ready_for_day_vote"]);
    assert.deepEqual(bot.sent[1].payload, { gameId: "g1" });
    assert.ok(bot.sent[0].payload.text.length <= 150);
});

test("봇: 낮 투표는 나·죽은 사람을 안 찍음, 광대는 동료도 안 찍음", async () => {
    for (let i = 0; i < 30; i += 1) {
        const bot = recordingBot();
        await bot.act("g1", snapshot({ dayPhase: "DAY_VOTE", self: { uuid: "me", role: "JOKER", allies: ["a"] } }), new Set(), 0);
        assert.equal(bot.sent.length, 1);
        assert.equal(bot.sent[0].event, "cast_day_vote");
        assert.ok(["b", "c"].includes(bot.sent[0].payload.targetId), bot.sent[0].payload.targetId);
    }
});

test("봇: 재판은 피고가 아닐 때만 유죄·무죄 하나를 그날 날짜로 보냄", async () => {
    const voter = recordingBot();
    await voter.act("g1", snapshot({ phase: "TRIBUNAL", dayIndex: 2, dayPhase: undefined, tribunal: { defendantUuid: "a", resolved: false } }), new Set(), 0);
    assert.equal(voter.sent[0].event, "cast_tribunal_vote");
    assert.equal(voter.sent[0].payload.dayIndex, 2);
    assert.ok(["GUILTY", "NOT_GUILTY"].includes(voter.sent[0].payload.vote));

    const defendant = recordingBot();
    await defendant.act("g1", snapshot({ phase: "TRIBUNAL", dayPhase: undefined, tribunal: { defendantUuid: "me", resolved: false } }), new Set(), 0);
    assert.equal(defendant.sent.length, 0);

    const late = recordingBot();
    await late.act("g1", snapshot({ phase: "TRIBUNAL", dayPhase: undefined, tribunal: { defendantUuid: "a", resolved: true } }), new Set(), 0);
    assert.equal(late.sent.length, 0);
});

test("봇: 밤엔 내 직업 차례에만 고름, 마녀사냥꾼은 죽은 사람만(없으면 건너뛰기)", async () => {
    const night = (over) => snapshot({ phase: "NIGHT", dayPhase: undefined, ...over });
    const notMyTurn = recordingBot();
    await notMyTurn.act("g1", night({ nightTurnRole: "JOKER", self: { uuid: "me", role: "DOCTOR", allies: [] } }), new Set(), 0);
    assert.equal(notMyTurn.sent.length, 0);

    const doctor = recordingBot();
    await doctor.act("g1", night({ nightTurnRole: "DOCTOR", self: { uuid: "me", role: "DOCTOR", allies: [] } }), new Set(), 0);
    assert.equal(doctor.sent[0].event, "submit_night_action");
    assert.ok(["a", "b", "c"].includes(doctor.sent[0].payload.targetId));

    const hunter = recordingBot();
    await hunter.act("g1", night({ nightTurnRole: "WITCH_HUNTER", self: { uuid: "me", role: "WITCH_HUNTER", allies: [] } }), new Set(), 0);
    assert.equal(hunter.sent[0].payload.targetId, "d");

    const hunterNoDead = recordingBot();
    await hunterNoDead.act("g1", night({
        nightTurnRole: "WITCH_HUNTER", self: { uuid: "me", role: "WITCH_HUNTER", allies: [] }, players: [P("me"), P("a"), P("b")],
    }), new Set(), 0);
    assert.equal(hunterNoDead.sent[0].payload.targetId, null);
});

test("봇: 죽은 뒤·역할 확인 단계엔 아무것도 안 보냄", async () => {
    const dead = recordingBot();
    await dead.act("g1", snapshot({ dayPhase: "DAY_VOTE", players: [P("me", false), P("a"), P("b")] }), new Set(), 1);
    assert.equal(dead.sent.length, 0);
    const reveal = recordingBot();
    await reveal.act("g1", snapshot({ phase: "ROLE_REVEAL", dayIndex: 0, dayPhase: undefined }), new Set(), 1);
    assert.equal(reveal.sent.length, 0);
});

test("봇: 판 상태 답에 따라 끝(ENDED)·탈락(LOST)·판 사라짐(VANISHED)·시간 넘김(TIMEOUT)을 가림", async () => {
    const run = (answers, maxMs = 2000) => {
        let i = 0;
        const bot = recordingBot({ answers: { get_session_snapshot: () => answers[Math.min(i++, answers.length - 1)] } });
        return bot.playUntilEnded("g1", { pollMs: 1, chatChance: 0, maxMs });
    };
    assert.equal(await run([{ ok: false, code: "SESSION_ROUTING_PENDING" }, { ok: true, phase: "ROLE_REVEAL" }, { ok: true, phase: "ENDED" }]), "ENDED");
    assert.equal(await run([{ ok: false, code: "FORFEITED_FROM_SESSION" }]), "LOST");
    assert.equal(await run([{ ok: false, code: "SESSION_NOT_FOUND" }]), "VANISHED");
    assert.equal(await run([{ ok: true, phase: "ROLE_REVEAL" }], 30), "TIMEOUT");
});

test("봇: 규칙 거절은 거절로, 서버 문제(내부 오류·표 저장 실패·답 없음)는 오류로 셈", async () => {
    const stats = new Stats();
    const bot = new Bot({ origin: "http://127.0.0.1:4100", account: {}, index: 1, stats, timeoutMs: 50 });
    const replies = {
        send_emoji: { ok: false, code: "INVALID_PHASE" },
        cast_day_vote: { ok: false, code: "GAME_ALREADY_ENDED" },
        cast_tribunal_vote: { ok: false, code: "INTERNAL_ERROR" },
        submit_night_action: { ok: false, code: "VOTE_PERSIST_FAILED" },
        create_room: { ok: false, message: "코드 없는 거절" },
        set_ready: { ok: true },
    };
    bot.socket = {
        timeout: () => ({
            emitWithAck: async (event) => {
                if (event === "get_session_snapshot") throw new Error("operation has timed out");
                return replies[event];
            },
        }),
    };
    for (const event of [...Object.keys(replies), "get_session_snapshot"]) await bot.request(event, {});
    const summary = stats.summary();
    assert.deepEqual(summary.rejections, { "send_emoji:INVALID_PHASE": 1, "cast_day_vote:GAME_ALREADY_ENDED": 1, "create_room:NO_CODE": 1 });
    assert.deepEqual(summary.errors, { "cast_tribunal_vote:INTERNAL_ERROR": 1, "submit_night_action:VOTE_PERSIST_FAILED": 1, "get_session_snapshot:timeout": 1 });
});
