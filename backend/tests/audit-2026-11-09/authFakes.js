'use strict';

// 인증·이메일 시험 공용 가짜 저장소 (DB 안 씀)
// 사용자·세션·로그인 기록·정지·state·가입 의도·외부 계정·인증 행·재설정 토큰을 메모리에 두고
// 저장소 모듈 객체 함수를 갈아끼움, 트랜잭션은 던지면 전부 되돌림
const userRepository = require('../../repositories/user');
const verificationRepository = require('../../repositories/auth/signupEmailVerification');
const resetTokenRepository = require('../../repositories/auth/passwordResetToken');
const findRequestRepository = require('../../repositories/auth/accountFindRequest');
const userLookup = require('../../repositories/user/lookup');

const uniqueError = (message) => Object.assign(new Error(message), { name: 'SequelizeUniqueConstraintError' });

const createAuthStore = ({ clock = () => new Date() } = {}) => {
    const data = {
        users: [], sessions: [], history: [], bans: [], states: [], intents: [], identities: [],
        verifications: [], resetTokens: [], findRequests: [], evicted: [],
    };
    const calls = [];
    const hooks = {};
    let seq = 0;
    const nextId = (prefix) => `${prefix}-${++seq}`;
    const now = () => clock();
    // 트랜잭션 안에서 던지면 되돌릴 사진 (행 객체는 그대로 두고 칸 값·목록만 되돌림, 시험이 쥔 참조 유지)
    const snapshot = () => Object.fromEntries(Object.entries(data).map(([key, rows]) => [
        key, { list: [...rows], copies: rows.map((row) => [row, { ...row }]) },
    ]));
    const restore = (saved) => {
        for (const [key, { list, copies }] of Object.entries(saved)) {
            for (const [row, copy] of copies) {
                for (const field of Object.keys(row)) if (!(field in copy)) delete row[field];
                Object.assign(row, copy);
            }
            data[key].splice(0, data[key].length, ...list);
        }
    };

    const repo = {
        withTransaction: async (work) => {
            const saved = snapshot();
            const transaction = { id: nextId('tx'), LOCK: { UPDATE: 'UPDATE' } };
            try {
                return await work(transaction);
            } catch (error) {
                restore(saved);
                throw error;
            }
        },
        findByEmail: async (email) => data.users.find((u) => u.email === email) ?? null,
        findByNickname: async (nickname) => data.users.find((u) => u.nickname === nickname) ?? null,
        findByUuid: async (uuid) => data.users.find((u) => u.uuid === uuid) ?? null,
        createUser: async (values) => {
            if (data.users.some((u) => u.email === values.email)) throw uniqueError('email');
            const row = {
                uuid: nextId('user'), role: 'USER', status: 'ACTIVE', has_local_password: true,
                failed_login_count: 0, locked_until: null, ...values,
            };
            data.users.push(row);
            return row;
        },
        updateUser: async (uuid, patch) => {
            const row = data.users.find((u) => u.uuid === uuid);
            if (row) Object.assign(row, patch);
            return [row ? 1 : 0];
        },
        createUserStats: async (uuid) => ({ user_id: uuid }),
        createLoginHistory: async (row) => {
            if (hooks.createLoginHistory) hooks.createLoginHistory(row);
            const entry = { id: nextId('hist'), login_at: now(), logout_at: null, ...row };
            data.history.push(entry);
            return entry;
        },
        checkActiveBan: async (uuid) => data.bans.find((b) => b.user_id === uuid) ?? null,
        createUserSession: async (row) => {
            const entry = {
                revoked_at: null, refresh_previous_hash: null, refresh_previous_expires_at: null, ...row,
            };
            data.sessions.push(entry);
            return entry;
        },
        findActiveSession: async (id, userId) => {
            if (!id || !userId) return null;
            return data.sessions.find((s) => s.id === id && s.user_id === userId && s.is_online && !s.revoked_at) ?? null;
        },
        markOnlineSessionsOffline: async (uuid) => {
            let count = 0;
            for (const s of data.sessions) {
                if (s.user_id === uuid && !s.revoked_at) { s.is_online = false; s.revoked_at = now(); count += 1; }
            }
            return [count];
        },
        recordLogout: async (uuid, sessionId) => {
            const s = data.sessions.find((x) => x.id === sessionId && x.user_id === uuid && x.is_online);
            if (!s) return;
            s.is_online = false; s.revoked_at = now();
            const last = [...data.history].reverse().find((h) => h.user_id === uuid && h.success && !h.logout_at);
            if (last) last.logout_at = now();
        },
        findSessionForRefresh: async (hash) => {
            if (!hash) return null;
            const direct = data.sessions.find((s) => s.refresh_token_hash === hash || s.refresh_previous_hash === hash);
            if (direct) return direct;
            const old = data.evicted.find((e) => e.hash === hash);
            return old ? data.sessions.find((s) => s.id === old.sessionId) ?? null : null;
        },
        applyRefreshRotation: async (sessionId, { newHash, previousHash, previousExpiresAt, evictedHash }) => {
            if (evictedHash) data.evicted.push({ sessionId, hash: evictedHash });
            const s = data.sessions.find((x) => x.id === sessionId);
            Object.assign(s, {
                refresh_token_hash: newHash, refresh_previous_hash: previousHash, refresh_previous_expires_at: previousExpiresAt,
            });
            return [1];
        },
        findExternalIdentity: async ({ provider, subject }) => (
            data.identities.find((i) => i.provider === provider && i.subject === subject) ?? null
        ),
        createExternalIdentity: async (row) => {
            if (data.identities.some((i) => i.provider === row.provider && i.subject === row.subject)) throw uniqueError('identity');
            const entry = { id: nextId('ident'), ...row };
            data.identities.push(entry);
            return entry;
        },
        createOAuthState: async (row) => { const entry = { id: nextId('state'), consumed_at: null, ...row }; data.states.push(entry); return entry; },
        findOAuthStateByHash: async (hash) => data.states.find((s) => s.state_hash === hash) ?? null,
        markOAuthStateConsumed: async (id) => { const s = data.states.find((x) => x.id === id); s.consumed_at = now(); return [1]; },
        createSocialSignupIntent: async (row) => { const entry = { id: nextId('intent'), consumed_at: null, ...row }; data.intents.push(entry); return entry; },
        findIntentByHash: async (hash) => data.intents.find((i) => i.intent_token_hash === hash) ?? null,
        markIntentConsumed: async (id) => { const i = data.intents.find((x) => x.id === id); i.consumed_at = now(); return [1]; },
    };

    const verification = {
        lockByEmail: async ({ email, purpose }) => data.verifications.find((v) => v.email === email && v.purpose === purpose) ?? null,
        createVerification: async (row) => {
            if (hooks.createVerification) hooks.createVerification(row);
            if (data.verifications.some((v) => v.email === row.email && v.purpose === row.purpose)) throw uniqueError('verification');
            const entry = {
                id: nextId('ver'), code_hash: null, code_expires_at: null, code_consumed_at: null, sent_at: null,
                proof_hash: null, proof_expires_at: null, proof_consumed_at: null, ...row,
            };
            data.verifications.push(entry);
            return entry;
        },
        updateVerification: async (id, patch) => {
            const v = data.verifications.find((x) => x.id === id);
            if (v) Object.assign(v, patch);
            return [v ? 1 : 0];
        },
    };

    const resetTokens = {
        revokeOpenTokens: async (userId) => {
            for (const r of data.resetTokens) if (r.user_id === userId && !r.used && !r.revoked_at) r.revoked_at = now();
            return [1];
        },
        createToken: async (row) => { const entry = { id: nextId('reset'), revoked_at: null, ...row }; data.resetTokens.push(entry); return entry; },
        findByHash: async (hash) => data.resetTokens.find((r) => r.token_hash === hash) ?? null,
        lockByHash: async (hash) => data.resetTokens.find((r) => r.token_hash === hash) ?? null,
        markUsed: async (id) => { const r = data.resetTokens.find((x) => x.id === id); r.used = true; return [1]; },
    };

    const findRequests = {
        recordFindId: async (ipAddress) => { data.findRequests.push({ ip_address: ipAddress }); return {}; },
    };
    const lookup = {
        findForFindId: async (db, nickname) => data.users.find((u) => typeof u.nickname === 'string' && u.nickname.trim() === nickname) ?? null,
    };

    // 부른 순서 기록하게 감쌈
    const wrap = (name, fn) => async (...args) => {
        calls.push({ name, args });
        if (hooks[`before:${name}`]) await hooks[`before:${name}`](...args);
        return fn(...args);
    };

    return {
        data, calls, hooks, repo, verification, resetTokens, findRequests, lookup, wrap,
        names: () => calls.map((c) => c.name),
        argsOf: (name) => calls.find((c) => c.name === name)?.args,
        callsOf: (name) => calls.filter((c) => c.name === name),
    };
};

// 저장소 모듈 객체에 가짜를 끼우고 시험 끝나면 되돌림
const installAuthStore = (t, store) => {
    const pairs = [
        [userRepository, store.repo],
        [verificationRepository, store.verification],
        [resetTokenRepository, store.resetTokens],
        [findRequestRepository, store.findRequests],
        [userLookup, store.lookup],
    ];
    for (const [target, fake] of pairs) {
        const originals = {};
        for (const key of Object.keys(fake)) {
            originals[key] = target[key];
            target[key] = store.wrap(key, fake[key]);
        }
        t.after(() => Object.assign(target, originals));
    }
    return store;
};

// 시험 하나에서 새 저장소 + 설치
const useAuthStore = (t, options) => installAuthStore(t, createAuthStore(options));

// 모듈 객체 함수 하나 갈아끼우기
const swap = (t, target, name, impl) => {
    const original = target[name];
    target[name] = impl;
    t.after(() => { target[name] = original; });
};

// 정해진 시각에서 시작해 손으로 움직이는 시계
const createClock = (start = '2026-11-09T00:00:00.000Z') => {
    let ms = new Date(start).getTime();
    return {
        now: () => new Date(ms),
        nowMs: () => ms,
        advance: (deltaMs) => { ms += deltaMs; },
        set: (value) => { ms = new Date(value).getTime(); },
    };
};

module.exports = { createAuthStore, installAuthStore, useAuthStore, swap, createClock, uniqueError };
