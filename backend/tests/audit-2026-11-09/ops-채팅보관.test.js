'use strict';

// 운영 받침 2단계 시험: 판 채팅 보관(상한·판 끝 10분·조용한 판)·증거 90일 정리·금지어(채팅 가리기·닉네임 거절)·채팅 처리기 연결
// 채팅 처리기는 가짜 소켓 세상(gameFixtures)에서 진짜로 돌림, 닉네임은 저장소 가짜 (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const chatBuffer = require('../../services/ops/chatBuffer');
const bannedWords = require('../../services/ops/bannedWords');
const { purgeExpiredChatEvidence, RETENTION_DAYS } = require('../../services/ops/evidenceRetention');
const userService = require('../../services/user');
const userRepository = require('../../repositories/user');
const accountService = require('../../services/auth/account');
const socialService = require('../../services/auth/social');
const F = require('./gameFixtures');
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');

const H = gs.__testables;
const T0 = Date.parse('2026-11-09T00:00:00Z');
const clock = (ms) => ({ now: () => ms });

const resetAll = () => {
    chatBuffer.__resetForTests();
    bannedWords.__setWordsForTests([]);
    F.core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    H.__setGameResultPersistForTests(async () => {});
    H.__setRecordVoteParticipationForTests(async () => ({ recorded: true }));
    H.__setEvaluateAchievementsForTests(async () => {});
};
test.beforeEach(resetAll);
test.after(resetAll);

const line = (text, extra = {}) => ({ channel: 'DAY', senderUuid: 'u1', nickname: '닉', text, sentAt: T0, ...extra });

// ── 판 채팅 보관 ──

test('채팅 보관: 넣은 순서대로 꺼내고 꺼낸 건 복사본 (밖에서 바꿔도 보관본 그대로)', () => {
    chatBuffer.recordGameChatMessage('g1', line('하나'), clock(T0));
    chatBuffer.recordGameChatMessage('g1', line('둘', { channel: 'JOKER' }), clock(T0));
    const got = chatBuffer.getGameChatMessages('g1', clock(T0));
    assert.deepEqual(got.map((m) => [m.channel, m.text]), [['DAY', '하나'], ['JOKER', '둘']]);
    assert.equal(got[0].at, '2026-11-09T00:00:00.000Z');
    got[0].text = '바꿈';
    assert.equal(chatBuffer.getGameChatMessages('g1', clock(T0))[0].text, '하나');
});

test('채팅 보관: 판 하나 500줄 넘으면 오래된 것부터 버림', () => {
    for (let i = 0; i < chatBuffer.MAX_MESSAGES_PER_GAME + 20; i += 1) {
        chatBuffer.recordGameChatMessage('g1', line(`m${i}`), clock(T0));
    }
    const got = chatBuffer.getGameChatMessages('g1', clock(T0));
    assert.equal(got.length, chatBuffer.MAX_MESSAGES_PER_GAME);
    assert.equal(got[0].text, 'm20');
});

test('채팅 보관: 글은 500자까지만 담음', () => {
    chatBuffer.recordGameChatMessage('g1', line('가'.repeat(900)), clock(T0));
    assert.equal(chatBuffer.getGameChatMessages('g1', clock(T0))[0].text.length, chatBuffer.MAX_TEXT_LENGTH);
});

test('채팅 보관: 판 수 상한 넘으면 끝난 판부터 버림', () => {
    chatBuffer.recordGameChatMessage('ended', line('x'), clock(T0));
    chatBuffer.markGameEnded('ended', clock(T0));
    for (let i = 0; i < chatBuffer.MAX_GAMES; i += 1) chatBuffer.recordGameChatMessage(`g${i}`, line('x'), clock(T0));
    assert.equal(chatBuffer.getBufferStats().games, chatBuffer.MAX_GAMES);
    assert.deepEqual(chatBuffer.getGameChatMessages('ended', clock(T0)), []);
    assert.equal(chatBuffer.getGameChatMessages('g0', clock(T0)).length, 1);
});

test('채팅 보관: 끝난 판이 없으면 가장 오래된 판부터 버림', () => {
    for (let i = 0; i <= chatBuffer.MAX_GAMES; i += 1) chatBuffer.recordGameChatMessage(`g${i}`, line('x'), clock(T0));
    assert.deepEqual(chatBuffer.getGameChatMessages('g0', clock(T0)), []);
    assert.equal(chatBuffer.getGameChatMessages(`g${chatBuffer.MAX_GAMES}`, clock(T0)).length, 1);
});

test('채팅 보관: 판 끝 뒤 10분 안엔 남고 10분 지나면 사라짐', () => {
    chatBuffer.recordGameChatMessage('g1', line('증거'), clock(T0));
    chatBuffer.markGameEnded('g1', clock(T0));
    assert.equal(chatBuffer.getGameChatMessages('g1', clock(T0 + chatBuffer.KEEP_AFTER_END_MS - 1)).length, 1);
    assert.equal(chatBuffer.getGameChatMessages('g1', clock(T0 + chatBuffer.KEEP_AFTER_END_MS)).length, 0);
});

test('채팅 보관: 끝 표시 두 번 와도 처음 시각 기준', () => {
    chatBuffer.recordGameChatMessage('g1', line('a'), clock(T0));
    chatBuffer.markGameEnded('g1', clock(T0));
    chatBuffer.markGameEnded('g1', clock(T0 + 9 * 60 * 1000));
    assert.equal(chatBuffer.getGameChatMessages('g1', clock(T0 + chatBuffer.KEEP_AFTER_END_MS)).length, 0);
});

test('채팅 보관: 끝 표시 없이 3시간 조용한 판도 버림 (메모리 새는 것 막기)', () => {
    chatBuffer.recordGameChatMessage('g1', line('a'), clock(T0));
    assert.equal(chatBuffer.getGameChatMessages('g1', clock(T0 + chatBuffer.STALE_ACTIVE_MS - 1)).length, 1);
    assert.equal(chatBuffer.getGameChatMessages('g1', clock(T0 + chatBuffer.STALE_ACTIVE_MS)).length, 0);
});

test('채팅 보관: 모양 틀린 줄은 조용히 버림 (판 id·글 없음)', () => {
    assert.equal(chatBuffer.recordGameChatMessage('', line('a')), false);
    assert.equal(chatBuffer.recordGameChatMessage('g1', { text: 3 }), false);
    assert.equal(chatBuffer.getBufferStats().games, 0);
});

// ── 증거 90일 정리 ──

test('증거 정리: 저장한 지 90일 넘은 줄만 지움 (기준 시각 미만)', async () => {
    let where;
    const db = { ReportChatEvidence: { destroy: async (options) => { where = options.where; return 4; } } };
    const result = await purgeExpiredChatEvidence({ db, now: () => new Date(T0) });
    assert.equal(result.deleted, 4);
    assert.equal(RETENTION_DAYS, 90);
    assert.equal(where.saved_at[Op.lt].toISOString(), new Date(T0 - 90 * 24 * 60 * 60 * 1000).toISOString());
});

test('증거 정리: 날짜 수가 이상하면 아무것도 안 지우고 던짐', async () => {
    let called = false;
    const db = { ReportChatEvidence: { destroy: async () => { called = true; return 0; } } };
    await assert.rejects(purgeExpiredChatEvidence({ db, days: 0 }));
    assert.equal(called, false);
});

// ── 금지어 ──

test('금지어: 목록 비면 채팅 그대로·닉네임 안 막음', () => {
    assert.equal(bannedWords.maskBannedWords('아무 말'), '아무 말');
    assert.equal(bannedWords.containsBannedWord('아무닉'), false);
});

test('금지어 가리기: 같은 길이 *로, 대소문자 안 가림, 여러 번 나와도 전부', () => {
    bannedWords.__setWordsForTests(['바보', 'Noob']);
    assert.equal(bannedWords.maskBannedWords('너 바보야 NOOB 바보'), '너 **야 **** **');
});

test('금지어 가리기: 긴 단어가 먼저 가려짐 (겹친 단어)', () => {
    bannedWords.__setWordsForTests(['바보', '바보멍청이']);
    assert.equal(bannedWords.maskBannedWords('바보멍청이!'), '*****!');
});

test('금지어 닉네임: 공백 끼워도 걸림, 안 든 닉네임은 통과', () => {
    bannedWords.__setWordsForTests(['운영자']);
    assert.equal(bannedWords.containsBannedWord('진짜 운 영 자'), true);
    assert.equal(bannedWords.containsBannedWord('운동왕'), false);
});

test('금지어 다시 읽기: 켜진 단어만 읽고 빈 것·겹친 것 빼고 셈', async () => {
    let where;
    const db = { BannedWord: { findAll: async (options) => { where = options.where; return [{ word: ' Bad ' }, { word: 'bad' }, { word: '' }, { word: '욕' }]; } } };
    const result = await bannedWords.reloadBannedWords({ db });
    assert.deepEqual(where, { is_active: true });
    assert.equal(result.count, 2);
    assert.equal(bannedWords.maskBannedWords('BAD 욕'), '*** *');
});

test('금지어 다시 읽기: 실패하면 있던 목록 그대로', async () => {
    bannedWords.__setWordsForTests(['바보']);
    await assert.rejects(bannedWords.reloadBannedWords({ db: { BannedWord: { findAll: async () => { throw new Error('DB 꺼짐'); } } } }));
    assert.equal(bannedWords.getBannedWordCount(), 1);
});

test('닉네임 바꾸기: 금지어 들면 400 NICKNAME_BANNED_WORD, 저장 안 함', async (t) => {
    bannedWords.__setWordsForTests(['운영자']);
    let saved = false;
    t.mock.method(userRepository, 'findByNickname', async () => null);
    t.mock.method(userRepository, 'updateUser', async () => { saved = true; });
    const result = await userService.changeNickname('u1', '나는운영자');
    assert.deepEqual({ ok: result.ok, status: result.status, code: result.code }, { ok: false, status: 400, code: 'NICKNAME_BANNED_WORD' });
    assert.equal(saved, false);
});

test('닉네임 바꾸기: 금지어 표 비면 예전처럼 저장', async (t) => {
    let saved = false;
    t.mock.method(userRepository, 'findByNickname', async () => null);
    t.mock.method(userRepository, 'updateUser', async () => { saved = true; });
    assert.deepEqual(await userService.changeNickname('u1', '나는운영자'), { ok: true });
    assert.equal(saved, true);
});

test('이메일 가입: 금지어 든 닉네임은 해시·DB 전에 400 NICKNAME_BANNED_WORD', async (t) => {
    bannedWords.__setWordsForTests(['운영자']);
    let touched = false;
    t.mock.method(userRepository, 'withTransaction', async () => { touched = true; });
    await assert.rejects(
        accountService.signup({ email: 'a@example.com', password: 'Password1!', passwordConfirm: 'Password1!', nickname: '운영자님', birthDate: '2000-01-01', signupProof: 'p' }),
        (e) => e.code === 'NICKNAME_BANNED_WORD' && e.status === 400,
    );
    assert.equal(touched, false);
});

test('소셜 가입: 금지어 든 닉네임은 DB 전에 400 NICKNAME_BANNED_WORD', async () => {
    bannedWords.__setWordsForTests(['운영자']);
    await assert.rejects(
        socialService.completeSocialSignup({ intentToken: 'tok', nickname: '운영자님', birthDate: '2000-01-01' }),
        (e) => e.code === 'NICKNAME_BANNED_WORD',
    );
});

// ── 채팅 처리기 연결 ──

let seq = 0;
const world = ({ n = 5, phase = 'DAY', jokerCount = 1 } = {}) => {
    seq += 1;
    const session = F.startGame({ id: `ops${seq}`, n, jokerCount });
    F.toDay(session);
    if (phase === 'NIGHT') F.toNight(session);
    return { session, ...F.socketWorld(gs, session), uuids: [...session.players.keys()] };
};

test('낮 채팅 처리기: 받는 사람한텐 금지어 가린 글, 보관엔 원문 (신고 증거)', async () => {
    bannedWords.__setWordsForTests(['바보']);
    const { session, sock, io, uuids, received } = world();
    const res = await F.call(H.handleSubmitGameChatMessage, io, sock(uuids[0]), uuids[0], { gameId: session.id, text: '너 바보' });
    assert.equal(res.ok, true);
    assert.equal(received(uuids[1], 'day_chat_message_received')[0].payload.text, '너 **');
    const kept = chatBuffer.getGameChatMessages(session.id);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].text, '너 바보');
    assert.equal(kept[0].senderUuid, uuids[0]);
    assert.equal(kept[0].channel, 'DAY');
});

test('낮 채팅 처리기: 거절된 채팅(밤)은 보관 안 함', async () => {
    const { session, sock, io, uuids } = world({ phase: 'NIGHT' });
    const res = await F.call(H.handleSubmitGameChatMessage, io, sock(uuids[0]), uuids[0], { gameId: session.id, text: 'a' });
    assert.equal(res.ok, false);
    assert.equal(chatBuffer.getGameChatMessages(session.id).length, 0);
});

test('밤 같은 직업 채팅 처리기: 가린 글 전송 + 원문 보관 (채널 = 직업)', async () => {
    bannedWords.__setWordsForTests(['죽여']);
    const { session, sock, io, received } = world({ n: 6, phase: 'NIGHT', jokerCount: 2 });
    const [j1, j2] = F.byRole(session, 'JOKER');
    const res = await F.call(H.handleSubmitJokerChatMessage, io, sock(j1), j1, { gameId: session.id, text: '쟤 죽여' });
    assert.equal(res.ok, true);
    assert.equal(received(j2, 'joker_chat_message')[0].payload.text, '쟤 **');
    const kept = chatBuffer.getGameChatMessages(session.id);
    assert.equal(kept[0].text, '쟤 죽여');
    assert.equal(kept[0].channel, 'JOKER');
});

test('채팅 처리기: 금지어 가리기가 던져도 채팅은 원문으로 감', async (t) => {
    t.mock.method(bannedWords, 'maskBannedWords', () => { throw new Error('가리기 터짐'); });
    const { session, sock, io, uuids, received } = world();
    const res = await F.call(H.handleSubmitGameChatMessage, io, sock(uuids[0]), uuids[0], { gameId: session.id, text: '안녕' });
    assert.equal(res.ok, true);
    assert.equal(received(uuids[1], 'day_chat_message_received')[0].payload.text, '안녕');
});
