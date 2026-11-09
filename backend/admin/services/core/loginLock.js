'use strict';

// 로그인 잠깐 막기 파일, 같은 아이디 15분 안 5번·같은 IP 15분 안 20번 틀리면 15분 막기 + 시도 한 줄씩 남기기
// 관리자 로그인(login.js)·계정 명령 unlock이 씀, 셈은 DB 표 admin_login_attempts (Node 여러 개도 같은 수)
const { Op } = require('sequelize');

const defaultDb = () => require('../../../repositories/common/db');

const MINUTE_MS = 60 * 1000;
const RULES = Object.freeze({
    loginId: Object.freeze({ max: 5, windowMs: 15 * MINUTE_MS, lockMs: 15 * MINUTE_MS }),
    ip: Object.freeze({ max: 20, windowMs: 15 * MINUTE_MS, lockMs: 15 * MINUTE_MS }),
});
// 막혀서 거절된 시도는 셈에 안 넣음 (막는 시간이 끝없이 늘지 않게)
const LOCKED = 'LOCKED';
// 계정 명령 unlock이 남기는 표시 줄 (성공처럼 셈을 끊음)
const UNLOCKED = 'UNLOCKED';
const CLI_IP = 'CLI';

const toMs = (value) => (value instanceof Date ? value : new Date(value)).getTime();

// 최근 틀림 줄(새것부터) → 막힘이면 남은 초, 아니면 null
// 새것부터 max번째 틀림까지가 창 안이면 → 가장 새 틀림 + lockMs까지 막힘
const remainingSec = (failures, rule, nowMs) => {
    if (failures.length < rule.max) return null;
    const newest = toMs(failures[0].created_at);
    const oldest = toMs(failures[rule.max - 1].created_at);
    if (newest - oldest > rule.windowMs) return null;
    const until = newest + rule.lockMs;
    return nowMs < until ? Math.ceil((until - nowMs) / 1000) : null;
};

// 아이디 셈: 마지막 성공(또는 unlock) 뒤의 틀림만
const loginIdFailures = async (loginId, from, now, db) => {
    const rows = await db.AdminLoginAttempt.findAll({
        attributes: ['id', 'ok', 'created_at'],
        where: {
            login_id: loginId,
            created_at: { [Op.gte]: from, [Op.lte]: now },
            [Op.or]: [{ failure_code: null }, { failure_code: { [Op.ne]: LOCKED } }],
        },
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        limit: RULES.loginId.max,
        raw: true,
    });
    const firstOk = rows.findIndex((row) => Boolean(row.ok));
    return firstOk < 0 ? rows : rows.slice(0, firstOk);
};

// IP 셈: 틀림만 (성공해도 안 끊음)
const ipFailures = (ip, from, now, db) => db.AdminLoginAttempt.findAll({
    attributes: ['id', 'created_at'],
    where: { ip, ok: false, failure_code: { [Op.ne]: LOCKED }, created_at: { [Op.gte]: from, [Op.lte]: now } },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: RULES.ip.max,
    raw: true,
});

// 지금 막혔는지 → { locked:false } | { locked:true, retryAfterSec }
const checkLock = async ({ loginId, ip, now = new Date() }, { db = defaultDb() } = {}) => {
    // 창 + 막는 시간만큼만 뒤로 봄
    const from = new Date(now.getTime() - RULES.loginId.windowMs - RULES.loginId.lockMs);
    const [byLoginId, byIp] = await Promise.all([loginIdFailures(loginId, from, now, db), ipFailures(ip, from, now, db)]);
    const waits = [remainingSec(byLoginId, RULES.loginId, now.getTime()), remainingSec(byIp, RULES.ip, now.getTime())]
        .filter((sec) => sec !== null);
    return waits.length > 0 ? { locked: true, retryAfterSec: Math.max(...waits) } : { locked: false };
};

// 시도 한 줄 (성공 ok=true / 실패는 failureCode: BAD_CREDENTIALS·LOCKED·EMAIL_MISMATCH·DISABLED)
const recordAttempt = ({ loginId, adminId = null, ip, accessEmail = null, ok, failureCode = null, now = new Date() },
    { transaction, db = defaultDb() } = {}) => db.AdminLoginAttempt.create({
    login_id: String(loginId).slice(0, 50),
    admin_id: adminId,
    ip: ip || 'UNKNOWN',
    access_email: accessEmail,
    ok: Boolean(ok),
    failure_code: ok ? null : failureCode,
    created_at: now,
}, { transaction });

// 계정 명령 unlock: 아이디 셈을 끊는 표시 줄 (실패 줄은 지우지 않아 기록은 남음)
const unlockLogin = ({ loginId, adminId = null, now = new Date() }, { db = defaultDb() } = {}) => db.AdminLoginAttempt.create({
    login_id: loginId, admin_id: adminId, ip: CLI_IP, ok: true, failure_code: UNLOCKED, created_at: now,
});

module.exports = { RULES, checkLock, recordAttempt, unlockLogin };
