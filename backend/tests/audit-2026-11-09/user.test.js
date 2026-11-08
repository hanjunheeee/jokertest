'use strict';

// 유저 시험: 닉네임 바꾸기·내 프로필(서비스·처리기) · 사용자 저장소 순수 부분 (DB 대신 가짜 함수)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../models');
const userRepository = require('../../repositories/user');
const roleStatisticsQueries = require('../../services/game/roleStatistics/queries');
const { getRoleKoreanName } = require('../../services/game/roleStatistics');
const userService = require('../../services/user');
const profileController = require('../../controllers/profile.controller');
const authAccount = require('../../services/auth/account');
const { toConflictError } = require('../../repositories/user/transaction');
const profileRepository = require('../../repositories/user/profile');
const sessionRepository = require('../../repositories/user/session');
const refreshRepository = require('../../repositories/user/refresh');

const swap = (t, target, name, impl) => {
    const original = target[name];
    target[name] = impl;
    t.after(() => { target[name] = original; });
};

// 닉네임 저장소 흉내: 닉네임 → uuid 표
const fakeNicknames = (t, table) => {
    const saved = [];
    swap(t, userRepository, 'findByNickname', async (nickname) => (table[nickname] ? { uuid: table[nickname], nickname } : null));
    swap(t, userRepository, 'updateUser', async (uuid, data) => { saved.push({ uuid, ...data }); return [1]; });
    return saved;
};

const call = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    Promise.resolve(handler({ user: { uuid: 'me' }, ...req }, res, (error) => resolve({ error }))).catch((thrown) => resolve({ thrown }));
});

const fakeStatsQueries = (t, { highest = null, roleStats = [] } = {}) => {
    swap(t, roleStatisticsQueries, 'getHighestWinRateRole', async () => highest);
    swap(t, roleStatisticsQueries, 'getMyRoleStatistics', async () => roleStats);
};

// 닉네임 바꾸기 서비스
test('닉네임 바꾸기: 규칙에 안 맞으면 400과 규칙 문구, 저장 안 함', async (t) => {
    const saved = fakeNicknames(t, {});
    const result = await userService.changeNickname('me', '조');
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.message, /2~8자/);
    assert.equal(saved.length, 0);
});

test('닉네임 바꾸기: 남이 쓰는 닉네임이면 409', async (t) => {
    const saved = fakeNicknames(t, { 조커: 'other' });
    const result = await userService.changeNickname('me', '조커');
    assert.deepEqual(result, { ok: false, status: 409, message: '이미 사용 중인 닉네임입니다.' });
    assert.equal(saved.length, 0);
});

test('닉네임 바꾸기: 앞뒤 공백을 붙여도 다듬은 값으로 중복을 찾는다', async (t) => {
    fakeNicknames(t, { 조커: 'other' });
    const result = await userService.changeNickname('me', '  조커  ');
    assert.equal(result.status, 409);
});

test('닉네임 바꾸기: 지금 내 닉네임과 같으면 통과', async (t) => {
    const saved = fakeNicknames(t, { 조커: 'me' });
    assert.deepEqual(await userService.changeNickname('me', '조커'), { ok: true });
    assert.deepEqual(saved, [{ uuid: 'me', nickname: '조커' }]);
});

test('닉네임 바꾸기: 저장되는 값은 다듬은 닉네임', async (t) => {
    const saved = fakeNicknames(t, {});
    await userService.changeNickname('me', ' 새이름 ');
    assert.equal(saved[0].nickname, '새이름');
});

test('닉네임 바꾸기: 확인 뒤 저장 순간에 남이 먼저 가져가면(동시 요청) 409 오류가 그대로 올라온다', async (t) => {
    swap(t, userRepository, 'findByNickname', async () => null);
    swap(t, userRepository, 'updateUser', async () => { throw Object.assign(new Error('이미 사용 중인 닉네임입니다.'), { status: 409 }); });
    await assert.rejects(userService.changeNickname('me', '조커'), (error) => error.status === 409);
});

// 내 프로필 서비스
test('내 프로필: 계정이 없으면 null', async (t) => {
    swap(t, userRepository, 'getMyProfile', async () => null);
    fakeStatsQueries(t);
    assert.equal(await userService.getMyProfile('ghost'), null);
});

test('내 프로필: 판 수는 user_stats 그대로, 승률만 직업 통계 합 (99판 · 3판1승 + 1판1승 = 0.5, 사용자 결정 2026-11-09)', async (t) => {
    swap(t, userRepository, 'getMyProfile', async () => ({ nickname: 'n', profile_image_url: null, UserStat: { total_games: 99 } }));
    fakeStatsQueries(t, { roleStats: [{ games: 3, wins: 1 }, { games: 1, wins: 1 }] });
    const profile = await userService.getMyProfile('me');
    assert.equal(profile.total_games, 99);
    assert.equal(profile.account_win_rate, 0.5);
});

test('내 프로필: 판이 하나도 없으면 승률 0 (0으로 나누기 없음)', async (t) => {
    swap(t, userRepository, 'getMyProfile', async () => ({ nickname: 'n', profile_image_url: null, UserStat: {} }));
    fakeStatsQueries(t, { roleStats: [] });
    const profile = await userService.getMyProfile('me');
    assert.equal(profile.total_games, 0);
    assert.equal(profile.account_win_rate, 0);
});

test('내 프로필: 통계 행이 없으면 판 0·생존 0·처형 0·많이 한 직업 null, 칭호 칸 없음', async (t) => {
    swap(t, userRepository, 'getMyProfile', async () => ({ nickname: 'n', profile_image_url: null }));
    fakeStatsQueries(t);
    const profile = await userService.getMyProfile('me');
    assert.deepEqual(
        [profile.total_games, profile.survival_count, profile.execution_count, profile.most_played_role],
        [0, 0, 0, null],
    );
    assert.equal(Object.hasOwn(profile, 'title'), false);
});

test('내 프로필: 최고 승률 직업은 한글 이름, 없으면 null', async (t) => {
    swap(t, userRepository, 'getMyProfile', async () => ({ nickname: 'n', profile_image_url: null, UserStat: {} }));
    fakeStatsQueries(t, { highest: { role: 'JOKER' } });
    assert.equal((await userService.getMyProfile('me')).highest_win_rate_role, getRoleKoreanName('JOKER'));
    assert.equal(getRoleKoreanName('JOKER'), '광대');
});

// 프로필 처리기
test('프로필 처리기: 계정이 없으면 404 success:false', async (t) => {
    swap(t, userService, 'getMyProfile', async () => null);
    const result = await call(profileController.getMyProfile, {});
    assert.equal(result.status, 404);
    assert.equal(result.body.success, false);
});

test('닉네임 처리기: 본문이 없어도 500이 아니라 400', async (t) => {
    fakeNicknames(t, {});
    const result = await call(profileController.updateNickname, { body: undefined });
    assert.equal(result.status, 400);
});

test('닉네임 처리기: 서비스가 409를 주면 409와 그 문구', async (t) => {
    fakeNicknames(t, { 조커: 'other' });
    const result = await call(profileController.updateNickname, { body: { nickname: '조커' } });
    assert.equal(result.status, 409);
    assert.equal(result.body.message, '이미 사용 중인 닉네임입니다.');
});

test('닉네임 처리기: 바꾸는 계정은 본문이 아니라 로그인 계정', async (t) => {
    const saved = fakeNicknames(t, {});
    await call(profileController.updateNickname, { user: { uuid: 'real' }, body: { nickname: '새이름', uuid: 'victim' } });
    assert.equal(saved[0].uuid, 'real');
});

test('비번 처리기: 두 칸 중 하나라도 비면 400', async (t) => {
    swap(t, authAccount, 'changePassword', async () => ({ ok: true }));
    assert.equal((await call(profileController.updatePassword, { body: { currentPassword: 'x' } })).status, 400);
    assert.equal((await call(profileController.updatePassword, { body: undefined })).status, 400);
});

test('비번 처리기: 비번이 글자가 아니면(배열·숫자) 400', async (t) => {
    swap(t, authAccount, 'changePassword', async () => ({ ok: true }));
    const result = await call(profileController.updatePassword, { body: { currentPassword: ['a'], newPassword: 12345678 } });
    assert.equal(result.status, 400);
});

test('비번 처리기: 새 비번이 규칙(8자 이상)에 안 맞으면 400과 규칙 문구', async (t) => {
    swap(t, authAccount, 'changePassword', async () => ({ ok: true }));
    const result = await call(profileController.updatePassword, { body: { currentPassword: 'oldpass12', newPassword: 'short' } });
    assert.equal(result.status, 400);
    assert.match(result.body.message, /8~64자/);
});

test('비번 처리기: 현재 비번이 틀리면 로그아웃시키는 401이 아니라 400 CURRENT_PASSWORD_INVALID', async (t) => {
    swap(t, authAccount, 'changePassword', async () => ({ ok: false }));
    const result = await call(profileController.updatePassword, { body: { currentPassword: 'wrongpass', newPassword: 'newpass123' } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'CURRENT_PASSWORD_INVALID');
});

test('비번 처리기: 바뀌면 200 success:true', async (t) => {
    swap(t, authAccount, 'changePassword', async () => ({ ok: true }));
    const result = await call(profileController.updatePassword, { body: { currentPassword: 'oldpass12', newPassword: 'newpass123' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
});

// 사용자 저장소 순수 부분
test('유일 충돌 바꾸기: 유일 제약 오류가 아니면 원래 오류 그대로', () => {
    const original = new Error('other');
    assert.equal(toConflictError(original), original);
    assert.equal(toConflictError(undefined), undefined);
});

test('유일 충돌 바꾸기: 닉네임 칸이면 409 닉네임 문구', () => {
    const error = toConflictError({ name: 'SequelizeUniqueConstraintError', errors: [{ path: 'nickname' }] });
    assert.equal(error.status, 409);
    assert.equal(error.message, '이미 사용 중인 닉네임입니다.');
});

test('유일 충돌 바꾸기: fields에 제약 이름(users_email_unique)만 있어도 이메일 문구', () => {
    const error = toConflictError({ name: 'SequelizeUniqueConstraintError', fields: { users_email_unique: 'a@b.com' } });
    assert.equal(error.message, '이미 사용 중인 이메일입니다.');
});

test('유일 충돌 바꾸기: 표에 없는 칸이면 409 일반 문구', () => {
    const error = toConflictError({ name: 'SequelizeUniqueConstraintError', fields: ['phone'] });
    assert.equal(error.status, 409);
    assert.equal(error.message, '이미 사용 중인 값입니다.');
});

test('세션 저장소: 세션 id나 사람이 없으면 DB 안 가고 null', async () => {
    assert.equal(await sessionRepository.findActiveSession(null, 'u'), null);
    assert.equal(await sessionRepository.findActiveSession('s', ''), null);
});

test('refresh 저장소: 해시가 비면 DB 안 가고 null', async () => {
    assert.equal(await refreshRepository.findSessionForRefresh(''), null);
    assert.equal(await refreshRepository.findSessionForRefresh(undefined), null);
});

test('프로필 저장소: 통계 칸이 null이면 그 칸만 기본값, 있는 값은 그대로', async (t) => {
    swap(t, db, 'User', {
        findOne: async () => ({
            nickname: 'n',
            profile_image_url: undefined,
            UserStat: { get: () => ({ title: '베테랑', total_games: null, survival_count: 3, execution_count: null, most_played_role: 'JOKER' }) },
        }),
    });
    const row = await profileRepository.getMyProfile('me');
    assert.equal(row.profile_image_url, null);
    assert.deepEqual(row.UserStat, { total_games: 0, survival_count: 3, execution_count: 0, most_played_role: 'JOKER' });
});

test('프로필 저장소: 계정 행이 없으면 null', async (t) => {
    swap(t, db, 'User', { findOne: async () => null });
    assert.equal(await profileRepository.getMyProfile('ghost'), null);
});
