'use strict';

// 회원 기능 시험: 회원 탈퇴 (판 중 거절 · 본인 확인 · 틀린 횟수 · 연결 정리·익명화 · 같은 이메일 재가입 · 접속 끊기 · 경로)
// DB 안 씀 (가짜 저장소·가짜 모델), 판 상태·소켓은 모듈 객체 함수를 갈아끼움
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-member-withdraw-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const authService = require('../../services/auth/account');
const withdrawService = require('../../services/auth/account/withdraw');
const withdrawRepository = require('../../repositories/user/withdraw');
const gameSession = require('../../game-core/gameSession');
const emitter = require('../../socket/emitter');
const db = require('../../models');
const signupEmailVerificationService = require('../../services/auth/signupEmailVerification');
const economyService = require('../../services/economy');
const { hashPassword } = require('../../utils/auth/credentials');
const { useAuthStore, swap } = require('./authFakes');
const { passSignupTerms } = require('../helpers/termsStub');

const PASSWORD = 'password-123';
let passwordHash;
test.before(async () => { passwordHash = await hashPassword(PASSWORD); });

// 가짜 저장소 + 판 밖 + 소켓 없음, 연결 정리·계정 닫기는 가짜 저장소 줄을 바꾸는 흉내
const setUp = (t, { inGame = false, user = {}, detachFails = false } = {}) => {
    const store = useAuthStore(t);
    withdrawService.__resetWithdrawAttemptsForTests();
    swap(t, gameSession, 'isMatchmakingBlocked', () => inGame);
    swap(t, gameSession, 'getActiveSessionRoutingInfo', () => (inGame ? { gameId: 'g-1' } : null));
    swap(t, emitter, 'getIo', () => null);
    const detached = [];
    swap(t, withdrawRepository, 'detachAccount', async (uuid, oldEmail) => {
        if (detachFails) throw new Error('친구 정리 실패');
        detached.push({ uuid, oldEmail });
    });
    swap(t, withdrawRepository, 'closeAccount', async (uuid) => {
        const row = store.data.users.find((u) => u.uuid === uuid);
        Object.assign(row, {
            email: withdrawRepository.anonymousEmailOf(uuid), nickname: withdrawRepository.anonymousNicknameOf(uuid),
            status: 'WITHDRAWN', deleted_at: new Date(),
        });
    });
    const row = {
        uuid: '11111111-2222-3333-4444-555555555555', email: 'leave@example.com', nickname: '떠날사람',
        password_hash: passwordHash, has_local_password: true, status: 'ACTIVE', ...user,
    };
    store.data.users.push(row);
    return { store, row, detached };
};

test('탈퇴: 진행 중인 판이 있으면 409 WITHDRAW_IN_GAME, 아무것도 안 바뀜', async (t) => {
    const { row, detached } = setUp(t, { inGame: true });
    await assert.rejects(authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD }), (e) => e.status === 409 && e.code === 'WITHDRAW_IN_GAME');
    assert.equal(row.status, 'ACTIVE');
    assert.equal(detached.length, 0);
});

test('탈퇴: 비번 없으면 400 WITHDRAW_PASSWORD_REQUIRED, 틀리면 400 WITHDRAW_PASSWORD_INVALID', async (t) => {
    const { row } = setUp(t);
    await assert.rejects(authService.withdrawAccount({ uuid: row.uuid }), (e) => e.code === 'WITHDRAW_PASSWORD_REQUIRED');
    await assert.rejects(authService.withdrawAccount({ uuid: row.uuid, password: 'wrong-pass' }), (e) => e.status === 400 && e.code === 'WITHDRAW_PASSWORD_INVALID');
    assert.equal(row.status, 'ACTIVE');
});

test('탈퇴: 비번 5번 틀리면 맞는 비번도 15분 동안 429 WITHDRAW_LOCKED', async (t) => {
    const { row } = setUp(t);
    let nowMs = Date.parse('2026-11-09T00:00:00Z');
    const now = () => nowMs;
    for (let i = 0; i < 5; i += 1) {
        await assert.rejects(authService.withdrawAccount({ uuid: row.uuid, password: 'wrong-pass' }, { now }), (e) => e.code === 'WITHDRAW_PASSWORD_INVALID');
    }
    await assert.rejects(authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD }, { now }), (e) => e.status === 429 && e.code === 'WITHDRAW_LOCKED');
    nowMs += 15 * 60 * 1000;
    await authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD }, { now });
    assert.equal(row.status, 'WITHDRAWN');
});

test('탈퇴: 소셜 전용 계정은 계정 이메일을 다시 써서 확인 (대소문자·빈칸 무시), 다르면 WITHDRAW_CONFIRM_MISMATCH', async (t) => {
    const { row } = setUp(t, { user: { has_local_password: false } });
    await assert.rejects(authService.withdrawAccount({ uuid: row.uuid, confirmEmail: 'other@example.com' }), (e) => e.code === 'WITHDRAW_CONFIRM_MISMATCH');
    await assert.rejects(authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD }), (e) => e.code === 'WITHDRAW_CONFIRM_MISMATCH');
    await authService.withdrawAccount({ uuid: row.uuid, confirmEmail: '  LEAVE@example.com ' });
    assert.equal(row.status, 'WITHDRAWN');
});

test('탈퇴: 성공하면 연결 정리(옛 이메일 넘김) → 계정 닫기, 이메일·닉네임은 알아볼 수 없게', async (t) => {
    const { row, detached, store } = setUp(t);
    const result = await authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(detached, [{ uuid: row.uuid, oldEmail: 'leave@example.com' }]);
    assert.equal(row.email, `withdrawn-${row.uuid}@withdrawn.invalid`);
    assert.equal(row.nickname, '탈퇴11111111222233334444555555555555');
    assert.ok(row.nickname.length <= 50, '닉네임 칸 50자 안');
    const lockCall = store.callsOf('findByUuid')[0];
    assert.equal(lockCall.args[1].lock, 'UPDATE', '계정 행 잠금');
});

test('탈퇴: 연결 정리 중 실패하면 계정 닫기까지 안 감 (트랜잭션 되돌림)', async (t) => {
    const { row } = setUp(t, { detachFails: true });
    await assert.rejects(authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD }), /친구 정리 실패/);
    assert.equal(row.status, 'ACTIVE');
    assert.equal(row.email, 'leave@example.com');
});

test('탈퇴: 그 사람 소켓 전부에 ACCOUNT_WITHDRAWN 알리고 끊음 (남의 소켓은 그대로)', async (t) => {
    const { row } = setUp(t);
    const events = [];
    // 소켓은 연결 때처럼 계정 채널(user:<uuid>)에 든 채, 가짜 io는 in(채널).fetchSockets()로 그 채널 소켓만 줌
    const fakeSocket = (uuid) => ({
        data: { user: { uuid } },
        rooms: new Set([`user:${uuid}`]),
        emit: (name, payload) => events.push([uuid, name, payload.code]),
        disconnect: () => events.push([uuid, 'disconnect']),
    });
    const sockets = new Map([['a', fakeSocket(row.uuid)], ['b', fakeSocket('someone-else')], ['c', fakeSocket(row.uuid)]]);
    swap(t, emitter, 'getIo', () => ({
        sockets: { sockets },
        in: (channel) => ({ fetchSockets: async () => [...sockets.values()].filter((s) => s.rooms.has(channel)) }),
    }));
    await authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD });
    assert.deepEqual(events, [
        [row.uuid, 'force_disconnect', 'ACCOUNT_WITHDRAWN'], [row.uuid, 'disconnect'],
        [row.uuid, 'force_disconnect', 'ACCOUNT_WITHDRAWN'], [row.uuid, 'disconnect'],
    ]);
});

test('탈퇴 뒤 같은 이메일·닉네임으로 다시 가입할 수 있음', async (t) => {
    const { row, store } = setUp(t);
    await authService.withdrawAccount({ uuid: row.uuid, password: PASSWORD });
    passSignupTerms(t);
    swap(t, signupEmailVerificationService, 'consumeSignupProof', async () => ({ ok: true }));
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));
    const user = await authService.signup({
        email: 'leave@example.com', password: PASSWORD, passwordConfirm: PASSWORD, nickname: '떠날사람',
        birthDate: '2000-01-01', signupProof: 'proof',
    });
    assert.notEqual(user.uuid, row.uuid);
    assert.equal(store.data.users.filter((u) => u.email === 'leave@example.com').length, 1);
});

// ── 저장소: 진짜 함수가 어떤 표를 어떻게 바꾸는지 (가짜 모델로 부른 내용만 봄) ──

const recordModel = (t, name, calls) => {
    const fake = {
        update: async (values, options) => { calls.push([name, 'update', values, options.where]); return [1]; },
        destroy: async (options) => { calls.push([name, 'destroy', options.where]); return 1; },
    };
    swap(t, db, name, fake);
};

test('탈퇴 저장소: 세션 끊기·소셜 연결·친구 4표·대기 초대 취소·접속·재설정·인증 줄 정리, 전적은 이름만 바꿈', async (t) => {
    const calls = [];
    for (const name of ['UserSession', 'ExternalIdentity', 'Friendship', 'FriendRequest', 'FriendFavorite', 'FriendBlock',
        'GameInvite', 'OnlinePresence', 'PasswordResetToken', 'SignupEmailVerification', 'GameResultPlayer']) {
        recordModel(t, name, calls);
    }
    swap(t, db.sequelize, 'literal', (sql) => ({ literal: sql }));
    const uuid = 'u-leave';
    await withdrawRepository.detachAccount(uuid, 'Leave@Example.com', { transaction: { id: 'tx' }, now: new Date('2026-11-09T00:00:00Z') });

    const byModel = Object.fromEntries(calls.map((c) => [c[0], c]));
    assert.equal(byModel.UserSession[2].is_online, false);
    assert.deepEqual(byModel.UserSession[3], { user_id: uuid, revoked_at: null });
    assert.deepEqual(byModel.ExternalIdentity, ['ExternalIdentity', 'destroy', { user_id: uuid }]);
    for (const name of ['Friendship', 'FriendRequest', 'FriendFavorite', 'FriendBlock']) {
        assert.equal(byModel[name][1], 'destroy', name);
    }
    assert.equal(byModel.GameInvite[2].status, 'CANCELLED');
    assert.equal(byModel.GameInvite[2].end_reason, 'ACCOUNT_WITHDRAWN');
    assert.equal(byModel.GameInvite[3].status, 'PENDING', '대기 중인 초대만 취소');
    assert.deepEqual(byModel.SignupEmailVerification[2], { email: 'leave@example.com' });
    assert.deepEqual(byModel.GameResultPlayer.slice(1, 3), ['update', { nickname_snapshot: '탈퇴한 사용자' }]);
});

test('탈퇴 저장소: 계정 닫기는 상태 WITHDRAWN·익명 이메일·닉네임·개인정보 비움 뒤 deleted_at 채우기(destroy)', async (t) => {
    const calls = [];
    recordModel(t, 'User', calls);
    await withdrawRepository.closeAccount('u-leave', { transaction: { id: 'tx' } });
    assert.equal(calls[0][1], 'update');
    assert.equal(calls[0][2].status, 'WITHDRAWN');
    assert.equal(calls[0][2].email, 'withdrawn-u-leave@withdrawn.invalid');
    assert.equal(calls[0][2].birth_date, null);
    assert.deepEqual(calls[1], ['User', 'destroy', { uuid: 'u-leave' }]);
});

// ── 경로 ──

test('탈퇴 경로: POST /user/me/withdraw는 로그인 필요, 실패 코드는 그대로 400·409로 답함', async (t) => {
    const express = require('express');
    const http = require('node:http');
    const { listenOnFetchablePort } = require('../helpers/fetchablePort');
    const member = require('../../controllers/auth/member');
    swap(t, authService, 'withdrawAccount', async ({ password }) => {
        const { createError } = require('../../utils/appError');
        if (password === 'game') throw createError('판 중', 409, 'WITHDRAW_IN_GAME');
        if (password !== PASSWORD) throw createError('틀림', 400, 'WITHDRAW_PASSWORD_INVALID');
        return { ok: true };
    });
    const app = express();
    app.use(express.json());
    app.post('/user/me/withdraw', (req, res, next) => { req.user = { uuid: 'u1' }; next(); }, member.withdraw);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const post = (body) => fetch(`${url}/user/me/withdraw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    const wrong = await post({ password: 'nope' });
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).code, 'WITHDRAW_PASSWORD_INVALID');
    assert.equal((await post({ password: 'game' })).status, 409);
    const ok = await post({ password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('set-cookie') ?? '', /accessToken=;/, '세션 쿠키 지움');

    const routes = require('../../routes/user.routes');
    const layer = routes.stack.find((l) => l.route?.path === '/me/withdraw');
    assert.ok(layer, '경로 있음');
    assert.equal(layer.route.stack[0].handle, require('../../middlewares/auth.middleware').verifyToken);
});
