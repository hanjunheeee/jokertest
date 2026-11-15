'use strict';

// 끝난 판 요청 거절 순수 시험 — 판이 끝나면 판을 바꾸는 요청 6가지가 전부 GAME_ALREADY_ENDED, 판 값은 그대로
// 목록 A07-B-043~048 (docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md)
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음
const gf = require('../audit-2026-11-09/gameFixtures');

const { core } = gf;

// 5명 판을 광대 승으로 끝냄: 시민 둘 밤에 죽은 걸로 두고, 셋째를 재판 처형 → 산 (광대 1, 시민 1)
// 광대 승으로 끝내는 까닭: 광대·시민이 살아 있어야 "산 사람도 끝난 판엔 못 함"을 볼 수 있음
let seq = 0;
function endedGame(t) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    seq += 1;
    const s = gf.startGame({ id: `a07e-${seq}`, n: 5 });
    gf.toDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [c1, c2, c3, c4] = gf.nonJokers(s);
    for (const u of [c1, c2]) {
        s.players.get(u).alive = false;
        s.players.get(u).deathReason = 'ASSASSINATION';
    }
    gf.toTribunal(s, c3);
    for (const v of [joker, c4]) assert.equal(core.submitTribunalVote(v, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(joker, s.id, s.dayIndex);
    const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.terminal?.winner, 'JOKER');
    assert.equal(s.phase, 'ENDED');
    return { s, joker, alive: c4, dead: c1 };
}

// 판 값 찍어 두기: 생사·승자 (요청 뒤 같은지 비교)
const pictureOf = (s) => ({
    phase: s.phase,
    winner: s.winResult?.winner,
    alive: [...s.players.values()].map((p) => [p.uuid, p.alive, p.deathReason ?? null]),
});

const REQUESTS = [
    { id: 'A07-B-043', name: '낮 투표', send: ({ s, alive, joker }) => core.submitDayVote(alive, s.id, joker) },
    { id: 'A07-B-044', name: '재판 표', send: ({ s, alive }) => core.submitTribunalVote(alive, s.id, s.dayIndex, 'GUILTY') },
    { id: 'A07-B-045', name: '밤 대상 고르기', send: ({ s, alive, joker }) => core.submitNightAction(joker, s.id, alive) },
    { id: 'A07-B-046', name: '낮 채팅', send: ({ s, alive }) => core.prepareGameChatMessage(alive, s.id, '안녕') },
    { id: 'A07-B-047', name: '토론 "준비"', send: ({ s, alive }) => core.acknowledgeDayVoteReady(alive, s.id) },
    { id: 'A07-B-048', name: '밤 직업 채팅', send: ({ s, joker }) => core.prepareJokerChatMessage(joker, s.id, '안녕') },
];

for (const req of REQUESTS) {
    test(`${req.id} 5명 판 끝난 뒤 ${req.name} → GAME_ALREADY_ENDED, 생사·승자 그대로`, (t) => {
        const game = endedGame(t);
        const before = pictureOf(game.s);
        const result = req.send(game);
        assert.equal(result?.ok, false);
        assert.equal(result?.code, 'GAME_ALREADY_ENDED');
        assert.deepEqual(pictureOf(game.s), before);
    });
}
