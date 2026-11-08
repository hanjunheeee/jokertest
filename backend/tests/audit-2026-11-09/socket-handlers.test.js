'use strict';

// 소켓 시험: 게임 요청 앞단 검사·답 모양·내부 코드 숨김·방송 받는 사람 (2차 묶음)
// 가짜 소켓·가짜 io, 전적 저장·업적·투표 참여 저장은 전부 가짜 주입 (진짜 DB 안 붙음)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core } = F;
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');

const H = gs.__testables;
const persisted = [];
let voteParticipation = async () => ({ recorded: true });

const resetAll = () => {
    core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    persisted.length = 0;
    voteParticipation = async () => ({ recorded: true });
    H.__setGameResultPersistForTests(async (record) => { persisted.push(record); });
    H.__setRecordVoteParticipationForTests((entry) => voteParticipation(entry));
    H.__setEvaluateAchievementsForTests(async () => {});
};
test.beforeEach(resetAll);
test.afterEach(resetAll);

let seq = 0;
const world = ({ n = 5, phase = 'DAY_VOTE', jokerCount = 1 } = {}) => {
    seq += 1;
    const session = F.startGame({ id: `sh${seq}`, n, jokerCount });
    if (phase !== 'ROLE_REVEAL') F.toDay(session);
    if (phase === 'DAY_VOTE') F.toVote(session);
    if (phase === 'NIGHT') F.toNight(session);
    const w = F.socketWorld(gs, session);
    return { session, ...w, uuids: [...session.players.keys()] };
};

// ── 앞단 검사 ──

test('옛 소켓(접속 목록이 새 소켓을 가리킴)에서 온 밤 행동은 STALE_SOCKET, 기록 안 남음', async () => {
    const { session, sock, registry } = world({ phase: 'NIGHT' });
    const joker = F.firstOf(session, 'JOKER');
    registry.set(joker, 'new-tab-socket');
    const res = await F.call(H.handleSubmitNightAction, sock(joker), joker, { gameId: session.id, targetId: F.byRole(session, 'CITIZEN')[0] });
    assert.equal(res.code, 'STALE_SOCKET');
    assert.equal(session.nightActions.size, 0);
});

test('끊긴 소켓(connected=false)에서 온 낮 표는 STALE_SOCKET', async () => {
    const { session, sock, io, uuids } = world();
    sock(uuids[0]).connected = false;
    const res = await F.call(H.handleSubmitDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, targetId: uuids[1] });
    assert.equal(res.code, 'STALE_SOCKET');
});

test('요청이 객체가 아니면(배열·null·문자열) INVALID_PAYLOAD', async () => {
    const { session, sock, io, uuids } = world();
    for (const bad of [[session.id], null, 'x']) {
        const res = await F.call(H.handleSubmitDayVote, io, sock(uuids[0]), uuids[0], bad);
        assert.equal(res.code, 'INVALID_PAYLOAD');
    }
});

test('밤 행동 대상이 숫자면 INVALID_PAYLOAD (core까지 안 감)', async () => {
    const { session, sock } = world({ phase: 'NIGHT' });
    const joker = F.firstOf(session, 'JOKER');
    const res = await F.call(H.handleSubmitNightAction, sock(joker), joker, { gameId: session.id, targetId: 3 });
    assert.equal(res.code, 'INVALID_PAYLOAD');
});

test('낮 판정 요청 날짜가 문자열이면 INVALID_PAYLOAD', async () => {
    const { session, sock, io, uuids } = world();
    const res = await F.call(H.handleResolveDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, dayIndex: '1' });
    assert.equal(res.code, 'INVALID_PAYLOAD');
});

test('callback 없이 온 밤 행동은 아무것도 안 바꿈', () => {
    const { session, sock } = world({ phase: 'NIGHT' });
    const joker = F.firstOf(session, 'JOKER');
    H.handleSubmitNightAction(sock(joker), joker, { gameId: session.id, targetId: F.byRole(session, 'CITIZEN')[0] });
    assert.equal(session.nightActions.size, 0);
});

test('callback이 던져도 핸들러 밖으로 안 샘, 표는 기록됨', async () => {
    const { session, sock, io, uuids } = world();
    await assert.doesNotReject(async () => {
        await H.handleSubmitDayVote(io, sock(uuids[0]), uuids[0], { gameId: session.id, targetId: null }, () => { throw new Error('화면 오류'); });
    });
    assert.equal(session.dayVotes.has(uuids[0]), true);
});

test('공개 거절 코드는 그대로 답함: 자기 자신 찍기 SELF_TARGET_NOT_ALLOWED + 거절 문구', async () => {
    const { session, sock, io, uuids } = world();
    const res = await F.call(H.handleSubmitDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, targetId: uuids[0] });
    assert.deepEqual(res, { ok: false, code: 'SELF_TARGET_NOT_ALLOWED', message: '요청을 처리할 수 없습니다.' });
});

test('장부가 어긋난 판(판은 지워지고 내 기록만 남음)은 INTERNAL_ERROR로 숨김', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    F.T.__deleteGameSessionOnlyForTests(session.id);
    const res = await F.call(H.handleAcknowledgeDayVoteReady, io, sock(uuids[0]), uuids[0], { gameId: session.id });
    assert.equal(res.code, 'INTERNAL_ERROR');
});

// ── 낮 표·판정 ──

test('낮 표: 1라운드 진짜 표는 참여 기록 저장 실패면 VOTE_PERSIST_FAILED, 표 자체는 남음', async () => {
    const { session, sock, io, uuids } = world();
    voteParticipation = async () => { throw new Error('DB 꺼짐'); };
    const res = await F.call(H.handleSubmitDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, targetId: uuids[1] });
    assert.equal(res.code, 'VOTE_PERSIST_FAILED');
    assert.equal(session.dayVotes.get(uuids[0]), uuids[1]);
});

test('낮 표: 기권은 참여 기록 저장이 실패해도 성공으로 답함', async () => {
    const { session, sock, io, uuids } = world();
    voteParticipation = async () => { throw new Error('DB 꺼짐'); };
    const res = await F.call(H.handleSubmitDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, targetId: null });
    assert.equal(res.ok, true);
});

test('낮 표 성공 답엔 효과음 사건이 실림 (종류·날짜·내 계정)', async () => {
    const { session, sock, io, uuids } = world();
    const res = await F.call(H.handleSubmitDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, targetId: uuids[1] });
    assert.deepEqual([res.ok, res.sfxEvent.kind, res.sfxEvent.dayIndex, res.sfxEvent.accountId], [true, 'day-vote-submitted', 1, uuids[0]]);
});

test('낮 표 낸 뒤 나한테만 진행 상태가 감 (남은 내 표 대상을 못 봄)', async () => {
    const { session, sock, io, uuids, received } = world();
    await F.call(H.handleSubmitDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, targetId: uuids[1] });
    assert.equal(received(uuids[0], 'session_self_progress').at(-1).payload.self.dayVoteTargetUuid, uuids[1]);
    assert.equal(received(uuids[1], 'session_self_progress').length, 0);
});

test('낮 판정 버튼: 재판으로 가면 답에 피고, 참가자 전원이 결과 방송 받음', async () => {
    const { session, sock, io, uuids, received } = world();
    for (const u of uuids) core.submitDayVote(u, session.id, u === uuids[1] ? null : uuids[1]);
    const res = await F.call(H.handleResolveDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, dayIndex: 1 });
    assert.deepEqual([res.ok, res.outcome, res.tribunalTargetUuid], [true, 'TRIBUNAL', uuids[1]]);
    for (const u of uuids) assert.equal(received(u, 'day_vote_resolved').length, 1);
});

test('낮 판정 버튼을 두 번 누르면 두 번째는 같은 결과만 답하고 방송은 한 번', async () => {
    const { session, sock, io, uuids, received } = world();
    for (const u of uuids) core.submitDayVote(u, session.id, null);
    const first = await F.call(H.handleResolveDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, dayIndex: 1 });
    const second = await F.call(H.handleResolveDayVote, io, sock(uuids[1]), uuids[1], { gameId: session.id, dayIndex: 1 });
    assert.deepEqual([first.ok, second.ok, second.outcome], [true, true, first.outcome]);
    assert.equal(received(uuids[2], 'day_vote_resolved').length, 1);
});

test('낮 판정 버튼: 아직 다 안 냈으면 ACTIONS_PENDING', async () => {
    const { session, sock, io, uuids } = world();
    core.submitDayVote(uuids[0], session.id, null);
    const res = await F.call(H.handleResolveDayVote, io, sock(uuids[0]), uuids[0], { gameId: session.id, dayIndex: 1 });
    assert.equal(res.code, 'ACTIONS_PENDING');
});

test('투표 준비: 전원 누르면 투표 단계 방송, 방송에 투표 마감 시각 실림', async () => {
    const { session, sock, io, uuids, received } = world({ phase: 'DAY' });
    let last;
    for (const u of uuids) last = await F.call(H.handleAcknowledgeDayVoteReady, io, sock(u), u, { gameId: session.id });
    assert.deepEqual([last.readyCount, last.requiredCount], [5, 5]);
    const changed = received(uuids[0], 'day_phase_changed').at(-1).payload;
    assert.equal(changed.dayPhase, 'DAY_VOTE');
    assert.ok(Number.isFinite(changed.dayPhaseDeadline));
});

test('[규칙 변경] 역할 확인 버튼: 전원 눌러도 ok만 답하고 역할 공개 그대로', async () => {
    const { session, sock, io, uuids } = world({ phase: 'ROLE_REVEAL' });
    for (const u of uuids) {
        const res = await F.call(H.handleAcknowledgeRoleReveal, io, sock(u), u, { gameId: session.id });
        assert.deepEqual(res, { ok: true });
    }
    assert.equal(session.phase, 'ROLE_REVEAL');
});

test('[규칙 변경] 역할 확인 버튼: 낮이 된 뒤 늦게 와도 ok', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    const res = await F.call(H.handleAcknowledgeRoleReveal, io, sock(uuids[0]), uuids[0], { gameId: session.id });
    assert.deepEqual(res, { ok: true });
    assert.equal(session.dayIndex, 1);
});

// ── 재판 ──

const tribunalWorld = (defendant = 'citizen') => {
    const w = world({ phase: 'DAY' });
    const target = defendant === 'joker' ? F.firstOf(w.session, 'JOKER') : F.byRole(w.session, 'CITIZEN')[0];
    F.toTribunal(w.session, target);
    return { ...w, defendantUuid: target, voters: w.uuids.filter((u) => u !== target) };
};

test('재판 표: 판 id가 숫자면 INVALID_PAYLOAD, 날짜가 없으면 INVALID_PAYLOAD', async () => {
    const { session, sock, io, voters } = tribunalWorld();
    assert.equal((await F.call(H.handleCastTribunalVote, io, sock(voters[0]), voters[0], { gameId: 1, dayIndex: 1, vote: 'GUILTY' })).code, 'INVALID_PAYLOAD');
    assert.equal((await F.call(H.handleCastTribunalVote, io, sock(voters[0]), voters[0], { gameId: session.id, vote: 'GUILTY' })).code, 'INVALID_PAYLOAD');
});

test('재판 표: 재판 문맥 어긋남(TRIBUNAL_RESOLUTION_MISMATCH)은 INTERNAL_ERROR로 숨김', async () => {
    const { session, sock, io, voters } = tribunalWorld();
    session.dayVoteResolution = { ...session.dayVoteResolution, outcome: 'ABSTAINED' };
    const res = await F.call(H.handleCastTribunalVote, io, sock(voters[0]), voters[0], { gameId: session.id, dayIndex: 1, vote: 'GUILTY' });
    assert.equal(res.code, 'INTERNAL_ERROR');
});

test('재판 표 성공 답: 표 값·효과음 사건', async () => {
    const { session, sock, io, voters } = tribunalWorld();
    const res = await F.call(H.handleCastTribunalVote, io, sock(voters[0]), voters[0], { gameId: session.id, dayIndex: 1, vote: 'NOT_GUILTY' });
    assert.deepEqual([res.ok, res.vote, res.sfxEvent.kind], [true, 'NOT_GUILTY', 'tribunal-vote-submitted']);
});

test('재판 판정 버튼: 무죄면 답에 수, 전원 결과 방송, 다음은 밤', async () => {
    const { session, sock, io, voters, received } = tribunalWorld();
    for (const v of voters) core.submitTribunalVote(v, session.id, 1, 'NOT_GUILTY');
    const res = await F.call(H.handleResolveTribunalVote, io, sock(voters[0]), voters[0], { gameId: session.id, dayIndex: 1 });
    assert.deepEqual([res.outcome, res.counts.notGuilty, res.executedUuid], ['NOT_GUILTY', 4, null]);
    assert.equal(received(voters[1], 'tribunal_vote_resolved').length, 1);
    assert.equal(session.phase, 'NIGHT');
});

test('재판 판정 버튼: 광대 처형으로 판이 끝나면 방송에 전원 정체가 실리고 전적 저장이 시작됨', async () => {
    const { session, sock, io, voters, received } = tribunalWorld('joker');
    for (const v of voters) core.submitTribunalVote(v, session.id, 1, 'GUILTY');
    await F.call(H.handleResolveTribunalVote, io, sock(voters[0]), voters[0], { gameId: session.id, dayIndex: 1 });
    await F.flush();
    const payload = received(voters[0], 'tribunal_vote_resolved')[0].payload;
    assert.equal(payload.winResult.winner, 'CITIZEN');
    assert.equal(payload.winResult.reveals.length, 5);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].result.winner, 'CITIZEN');
});

test('재판 마지막 안 낸 투표자가 나가면 남은 표로 바로 판정', () => {
    const { session, io, voters, received } = tribunalWorld();
    const citizenVoters = voters.filter((v) => session.players.get(v).role === 'CITIZEN');
    const leaver = citizenVoters[0];
    for (const v of voters) if (v !== leaver) core.submitTribunalVote(v, session.id, 1, 'NOT_GUILTY');
    H.applyParticipantDeparture(io, session, leaver, { reason: 'PLAYER_LEFT' });
    assert.equal(session.tribunal.resolved, true);
    assert.equal(received(voters.find((v) => v !== leaver), 'tribunal_vote_resolved').length, 1);
});

// ── 채팅 ──

test('낮 채팅: 판 참가자 전원(죽은 사람 포함)이 메시지를 받음', async () => {
    const { session, sock, io, uuids, received } = world({ phase: 'DAY' });
    session.players.get(uuids[4]).alive = false;
    const res = await F.call(H.handleSubmitGameChatMessage, io, sock(uuids[0]), uuids[0], { gameId: session.id, text: ' 안녕 ' });
    assert.equal(res.ok, true);
    for (const u of uuids) assert.equal(received(u, 'day_chat_message_received')[0]?.payload.text, '안녕');
});

test('낮 채팅: 보낸 사람 소켓이 판 채널 밖이면 INTERNAL_ERROR, 간격 기록 안 먹음', async () => {
    const { session, sock, io, uuids, received } = world({ phase: 'DAY' });
    sock(uuids[0]).rooms.delete(session.channelId);
    const res = await F.call(H.handleSubmitGameChatMessage, io, sock(uuids[0]), uuids[0], { gameId: session.id, text: 'a' });
    assert.equal(res.code, 'INTERNAL_ERROR');
    assert.equal(session.dayChatRateLimit.has(uuids[0]), false);
    assert.equal(received(uuids[1], 'day_chat_message_received').length, 0);
});

test('낮 채팅: 밤엔 INVALID_PHASE로 거절', async () => {
    const { session, sock, io, uuids } = world({ phase: 'NIGHT' });
    const res = await F.call(H.handleSubmitGameChatMessage, io, sock(uuids[0]), uuids[0], { gameId: session.id, text: 'a' });
    assert.equal(res.code, 'INVALID_PHASE');
});

test('광대 채팅: 동료 광대만 받고 시민은 못 받음', async () => {
    const { session, sock, io, received } = world({ n: 6, phase: 'NIGHT', jokerCount: 2 });
    const [j1, j2] = F.byRole(session, 'JOKER');
    const c0 = F.byRole(session, 'CITIZEN')[0];
    const res = await F.call(H.handleSubmitJokerChatMessage, io, sock(j1), j1, { gameId: session.id, text: '누구 죽일까' });
    assert.equal(res.ok, true);
    assert.equal(received(j2, 'joker_chat_message').length, 1);
    assert.equal(received(c0, 'joker_chat_message').length, 0);
});

test('광대 채팅: 글이 151자면 MESSAGE_TOO_LONG', async () => {
    const { session, sock, io } = world({ phase: 'NIGHT' });
    const j = F.firstOf(session, 'JOKER');
    const res = await F.call(H.handleSubmitJokerChatMessage, io, sock(j), j, { gameId: session.id, text: 'x'.repeat(151) });
    assert.equal(res.code, 'MESSAGE_TOO_LONG');
});

// ── 이모티콘 ──

const emojiSetup = (session, uuid, { owned = ['e1'], slots = ['e1'], last } = {}) => {
    session.emojiPaletteByUuid = new Map([[uuid, { owned, slots }]]);
    session.emojiRateLimit = new Map(last === undefined ? [] : [[uuid, last]]);
};

test('이모티콘: 가진 것·팔레트에 넣은 것이면 판 전체에 말풍선', async () => {
    const { session, sock, io, uuids, received } = world({ phase: 'DAY' });
    emojiSetup(session, uuids[0]);
    const res = await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: session.id, itemId: 'e1' });
    assert.equal(res.ok, true);
    assert.equal(received(uuids[3], 'emoji_shown')[0].payload.itemId, 'e1');
});

test('이모티콘: 안 가진 것 NOT_OWNED, 팔레트 밖 NOT_IN_PALETTE', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    emojiSetup(session, uuids[0], { owned: ['e1', 'e2'], slots: ['e1'] });
    assert.equal((await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: session.id, itemId: 'e9' })).code, 'NOT_OWNED');
    assert.equal((await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: session.id, itemId: 'e2' })).code, 'NOT_IN_PALETTE');
});

test('이모티콘: 죽은 사람은 PLAYER_NOT_ALIVE (BE-022)', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    emojiSetup(session, uuids[0]);
    session.players.get(uuids[0]).alive = false;
    assert.equal((await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: session.id, itemId: 'e1' })).code, 'PLAYER_NOT_ALIVE');
});

test('이모티콘: 마지막으로 보낸 지 1초 안이면 RATE_LIMITED, 기록 시각 안 바뀜', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    const future = Date.now() + 60_000;
    emojiSetup(session, uuids[0], { last: future });
    assert.equal((await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: session.id, itemId: 'e1' })).code, 'RATE_LIMITED');
    assert.equal(session.emojiRateLimit.get(uuids[0]), future);
});

test('이모티콘: 끝난 판 GAME_ENDED, 판 밖 사람 NOT_PARTICIPANT, 빈 id INVALID_PAYLOAD', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    emojiSetup(session, uuids[0]);
    assert.equal((await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: 'other', itemId: 'e1' })).code, 'NOT_PARTICIPANT');
    assert.equal((await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: session.id, itemId: '' })).code, 'INVALID_PAYLOAD');
    session.phase = 'ENDED';
    assert.equal((await F.call(H.handleSendEmoji, io, sock(uuids[0]), uuids[0], { gameId: session.id, itemId: 'e1' })).code, 'GAME_ENDED');
});

// ── 스냅샷 ──

test('스냅샷 요청: 사람마다 연결 표시가 붙고, 끊김 유예가 풀림', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    sock(uuids[2]).connected = false;
    H.beginDisconnectGrace(io, session, uuids[0]);
    const res = await F.call(H.handleGetSessionSnapshot, io, sock(uuids[0]), uuids[0], { gameId: session.id });
    assert.equal(res.ok, true);
    assert.equal(res.players.find((p) => p.uuid === uuids[2]).isConnected, false);
    assert.equal(res.players.find((p) => p.uuid === uuids[1]).isConnected, true);
    assert.equal(H.getDisconnectGraceRun(session.id, uuids[0]), undefined);
});

test('스냅샷 요청: 나가서 빠진 사람은 다시 못 들어온다는 문구로 거절', async () => {
    const { session, sock, io } = world({ phase: 'DAY' });
    const c0 = F.byRole(session, 'CITIZEN')[0];
    core.commitParticipantDeparture(session, c0);
    const res = await F.call(H.handleGetSessionSnapshot, io, sock(c0), c0, { gameId: session.id });
    assert.equal(res.code, 'FORFEITED_FROM_SESSION');
    assert.match(res.message, /다시 참여할 수 없습니다/);
});

test('스냅샷 요청: 판 채널 밖 소켓이면 SESSION_ROUTING_PENDING (채널 다시 넣는 중)', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    sock(uuids[0]).rooms.delete(session.channelId);
    const res = await F.call(H.handleGetSessionSnapshot, io, sock(uuids[0]), uuids[0], { gameId: session.id });
    assert.equal(res.code, 'SESSION_ROUTING_PENDING');
});

test('스냅샷 요청: 판 id가 숫자면 INVALID_PAYLOAD, 없으면 지금 판', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    assert.equal((await F.call(H.handleGetSessionSnapshot, io, sock(uuids[0]), uuids[0], { gameId: 5 })).code, 'INVALID_PAYLOAD');
    assert.equal((await F.call(H.handleGetSessionSnapshot, io, sock(uuids[0]), uuids[0], {})).gameId, session.id);
});

// ── 나가기 ──

test('나가기: 진행 중 판이면 ok, 남은 사람에게 탈락·참여 변경 방송', async () => {
    const { session, sock, io, received } = world({ phase: 'DAY' });
    const [c0, c1] = F.byRole(session, 'CITIZEN');
    const res = await F.call(H.handleLeaveGameSession, io, sock(c0), c0, { gameId: ` ${session.id} ` });
    assert.deepEqual(res, { ok: true });
    assert.equal(received(c1, 'player_eliminated')[0].payload.victimUuid, c0);
    assert.equal(received(c1, 'session_participation_changed')[0].payload.departedUuid, c0);
    assert.equal(sock(c0).rooms.has(session.channelId), false);
});

test('나가기를 두 번 보내도 ok (이미 빠짐)', async () => {
    const { session, sock, io } = world({ phase: 'DAY' });
    const c0 = F.byRole(session, 'CITIZEN')[0];
    await F.call(H.handleLeaveGameSession, io, sock(c0), c0, { gameId: session.id });
    const again = await F.call(H.handleLeaveGameSession, io, sock(c0), c0, { gameId: session.id });
    assert.deepEqual(again, { ok: true });
    assert.equal(session.participationRevision, 1);
});

test('나가기: 판 id가 공백뿐이면 INVALID_PAYLOAD', async () => {
    const { sock, io, uuids } = world({ phase: 'DAY' });
    assert.equal((await F.call(H.handleLeaveGameSession, io, sock(uuids[0]), uuids[0], { gameId: '   ' })).code, 'INVALID_PAYLOAD');
});

test('나가기: 옛 판 id로 오면 ok만 답하고 지금 판은 안 건드림', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    const res = await F.call(H.handleLeaveGameSession, io, sock(uuids[0]), uuids[0], { gameId: 'old-game' });
    assert.deepEqual(res, { ok: true });
    assert.equal(session.players.get(uuids[0]).isParticipating, true);
    assert.equal(core.getActiveSessionRoutingInfo(uuids[0]).gameId, session.id);
});

test('나가기: 광대가 나가 판이 끝나면 전적 저장 시작, 끝난 판에서 다 나가면 판이 지워짐', async () => {
    const { session, sock, io, uuids } = world({ phase: 'DAY' });
    const joker = F.firstOf(session, 'JOKER');
    await F.call(H.handleLeaveGameSession, io, sock(joker), joker, { gameId: session.id });
    await F.flush();
    assert.equal(session.phase, 'ENDED');
    assert.equal(persisted.length, 1);
    for (const u of uuids.filter((x) => x !== joker)) {
        assert.deepEqual(await F.call(H.handleLeaveGameSession, io, sock(u), u, { gameId: session.id }), { ok: true });
    }
    assert.equal(core.__getStateSnapshotForTests().gameSessions.length, 0);
});

test('낮 투표 중 안 낸 마지막 사람이 나가면 남은 표로 바로 판정', () => {
    const { session, io, received } = world();
    const [c0, c1] = F.byRole(session, 'CITIZEN');
    for (const u of session.players.keys()) if (u !== c0) core.submitDayVote(u, session.id, null);
    H.applyParticipantDeparture(io, session, c0, { reason: 'PLAYER_LEFT' });
    assert.equal(session.phase, 'NIGHT');
    assert.equal(received(c1, 'day_vote_resolved').length, 1);
});
