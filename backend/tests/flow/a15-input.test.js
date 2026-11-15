'use strict';

// 입력 검사 시험 — 닉네임 바꾸기에 이상한 글자·금지어, 신고 메모 길이, 친구 찾기 검색어의 %·_와 같은 칸 두 번
// 목록 A15-B-247~255 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-input.test.js
// 모델이 DB에 안 붙게 닿지 않는 주소 (꼭 다른 require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 서명 값 (시험 환경값에 없으면 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-input-test-only-secret-0123456789abcd';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const db = require('../../models');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const userRepository = require('../../repositories/user');
const bannedWords = require('../../services/ops/bannedWords');
const economyService = require('../../services/economy');
const gameLookup = require('../../services/ops/gameLookup');
const chatBuffer = require('../../services/ops/chatBuffer');
const { swap } = require('../audit-2026-11-09/authFakes');
const { startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');

// 라우터 새로 불러 요청 수 장부도 새로
const freshRouter = (relative) => {
    const resolved = require.resolve(relative);
    delete require.cache[resolved];
    return require(resolved);
};

// 로그인한 사람 쿠키 (세션 확인은 가짜로 늘 살아 있음)
const loginAs = (t, uuid) => {
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    return `accessToken=${jwt.sign({ uuid, role: 'USER', sessionId: `s-${uuid}` }, process.env.JWT_SECRET)}`;
};

// ── 닉네임 바꾸기 ──

// 가짜 계정 저장소: 닉네임 한 칸만 들고 있음
const useNicknameStore = (t, uuid, nickname) => {
    const users = new Map([[uuid, { uuid, nickname }]]);
    swap(t, userRepository, 'findByNickname', async (name) => [...users.values()].find((u) => u.nickname === name) ?? null);
    swap(t, userRepository, 'updateUser', async (id, patch) => {
        const row = users.get(id);
        if (row) Object.assign(row, patch);
        return [row ? 1 : 0];
    });
    return users;
};

const changeNickname = async (t, uuid, nickname) => {
    const cookie = loginAs(t, uuid);
    const users = useNicknameStore(t, uuid, '원래닉');
    const base = await startRouterServer(t, [['/user', freshRouter('../../routes/user.routes')]]);
    const res = await json(await send(base, 'PATCH', '/user/me/nickname', { cookie, body: { nickname } }));
    return { res, saved: users.get(uuid).nickname };
};

const ODD_NICKNAMES = [
    ['A15-B-247', '가운데 폭 0 빈칸', '탐​정'],
    ['A15-B-248', '글 방향 바꾸는 숨은 글자', '탐‮정'],
    ['A15-B-249', '<b> 꺾쇠', '<b>탐정'],
    ['A15-B-250', '이모지', '탐정😀'],
];
for (const [id, label, nickname] of ODD_NICKNAMES) {
    test(`${id} 닉네임 바꾸기에 ${label} → 400, 닉네임 그대로`, async (t) => {
        const { res, saved } = await changeNickname(t, `${id}-me`, nickname);
        assert.equal(res.status, 400);
        assert.equal(saved, '원래닉');
    });
}

test('A15-B-251 금지어 "바보" 든 닉네임 → 400 NICKNAME_BANNED_WORD "사용할 수 없는 단어가 들어간 닉네임입니다.", 그대로', async (t) => {
    // 금지어 표에 "바보" 하나 (끝나면 빈 표로 되돌림)
    await bannedWords.reloadBannedWords({ db: { BannedWord: { findAll: async () => [{ word: '바보' }] } } });
    t.after(() => bannedWords.reloadBannedWords({ db: { BannedWord: { findAll: async () => [] } } }));
    const { res, saved } = await changeNickname(t, 'a15-251-me', '나는바보');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NICKNAME_BANNED_WORD');
    assert.equal(res.body.message, '사용할 수 없는 단어가 들어간 닉네임입니다.');
    assert.equal(saved, '원래닉');
});

// ── 신고 메모 길이 ──

// 신고 저장소 가짜: 둘 다 그 판에 있었음, 만든 줄은 목록에 모음
const useReportStore = (t) => {
    const rows = [];
    swap(t, db.GameResultPlayer, 'count', async () => 2);
    swap(t, gameLookup, 'remoteParticipants', async () => null);
    swap(t, chatBuffer, 'getGameChatMessages', () => []);
    swap(t, gameLookup, 'remoteChatEvidence', async () => []);
    swap(t, db.Report, 'findOne', async () => null);
    swap(t, db.Report, 'create', async (values) => { const row = { id: rows.length + 1, ...values }; rows.push(row); return row; });
    return rows;
};

const reportWithMemo = async (t, memo) => {
    const reporter = crypto.randomUUID();
    const cookie = loginAs(t, reporter);
    const rows = useReportStore(t);
    const base = await startRouterServer(t, [['/reports', freshRouter('../../routes/report.routes')]]);
    const res = await json(await send(base, 'POST', '/reports', {
        cookie, body: { targetUuid: crypto.randomUUID(), gameId: crypto.randomUUID(), reasonCode: 'ABUSE', memo },
    }));
    return { res, rows };
};

test('A15-B-252 신고 메모 500자 → 받음, 신고 줄 하나', async (t) => {
    const { res, rows } = await reportWithMemo(t, '가'.repeat(500));
    assert.equal(res.status, 201);
    assert.equal(rows.length, 1);
});

test('A15-B-253 신고 메모 501자 → 거절, 신고 줄 없음', async (t) => {
    const { res, rows } = await reportWithMemo(t, '가'.repeat(501));
    assert.equal(res.status, 400);
    assert.equal(rows.length, 0);
});

// ── 친구 찾기 검색어 ──

// MySQL LIKE 흉내: \ 뒤 글자는 그대로, % = 아무 글자 여럿, _ = 아무 글자 하나 → '%\%%' 는 % 글자가 든 것만
const likeToRegExp = (pattern) => {
    let out = '';
    for (let i = 0; i < pattern.length; i += 1) {
        const ch = pattern[i];
        if (ch === '\\' && i + 1 < pattern.length) { i += 1; out += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
        if (ch === '%') { out += '.*'; continue; }
        if (ch === '_') { out += '.'; continue; }
        out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${out}$`, 'su');
};

// 친구 찾기 저장소 가짜: 닉네임에 %·_가 없는 사람 셋, 닉네임 조건은 LIKE 흉내로 거름
const useSearchStore = (t) => {
    const people = [
        { uuid: 'a15-s-1', nickname: '탐정하나', profile_image_url: null, status: 'ACTIVE' },
        { uuid: 'a15-s-2', nickname: 'detective', profile_image_url: null, status: 'ACTIVE' },
        { uuid: 'a15-s-3', nickname: '시민셋', profile_image_url: null, status: 'ACTIVE' },
    ];
    swap(t, db.User, 'findAll', async ({ where = {} } = {}) => {
        const likeKey = Object.getOwnPropertySymbols(where.nickname ?? {})[0];
        const matcher = likeToRegExp(String(where.nickname[likeKey]));
        return people.filter((p) => matcher.test(p.nickname));
    });
    for (const model of ['Friendship', 'FriendRequest', 'FriendBlock', 'OnlinePresence']) swap(t, db[model], 'findAll', async () => []);
    swap(t, economyService, 'getPublicProfileLoadouts', async () => ({}));
    return people;
};

const search = async (t, queryString) => {
    const cookie = loginAs(t, 'a15-search-me');
    useSearchStore(t);
    const base = await startRouterServer(t, [['/friends', freshRouter('../../routes/friend.routes')]]);
    return json(await send(base, 'GET', `/friends/search?${queryString}`, { cookie }));
};

test('A15-B-254 닉네임에 없는 %·_로 친구 찾기 → 0명 (전원이 나오지 않음)', async (t) => {
    // 준비 확인: 흉내 LIKE가 진짜로 거르는지 (보통 글자 → 한 명)
    const plain = await search(t, `q=${encodeURIComponent('탐정')}`);
    assert.equal(plain.body.data.length, 1, '준비: 보통 검색이 안 됨');
    for (const q of ['%', '_', '%_']) {
        const res = await search(t, `q=${encodeURIComponent(q)}`);
        assert.equal(res.status, 200, q);
        assert.deepEqual(res.body.data, [], `검색어 ${q}로 사람이 나옴`);
    }
});

test('A15-B-255 검색어 같은 칸 두 번(?q=가&q=나) → 400, 500 아님', async (t) => {
    const res = await search(t, `q=${encodeURIComponent('가')}&q=${encodeURIComponent('나')}`);
    assert.notEqual(res.status, 500);
    assert.equal(res.status, 400);
});
