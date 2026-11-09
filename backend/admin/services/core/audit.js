'use strict';

// 관리자 기록 도우미 파일, 관리자 행동 한 줄을 admin_audit_logs에 남김 (비밀 칸은 빼고)
// 관리자 쓰기 서비스가 같은 트랜잭션으로 부름: audit.record({ req, action, ... }, { transaction }) → { id }
const { getClientIp } = require('../../../utils/request');
const { AUDIT_ACTIONS } = require('./auditActions');

const defaultDb = () => require('../../../repositories/common/db');

const REASON_MAX = 500;
const REQUEST_ID_MAX = 64;
const TARGET_ID_MAX = 64;
const TARGET_TYPE_MAX = 40;

// 기록에 넣으면 안 되는 칸 이름 (대소문자·_·- 무시하고 봄)
const SECRET_WORDS = ['password', 'secret', 'token', 'cookie', 'assertion'];
const SECRET_NAMES = new Set(['otp', 'totp', 'sid', 'sessionid', 'hash']);

const isSecretKey = (key) => {
    const name = String(key).toLowerCase().replace(/[_-]/g, '');
    return SECRET_NAMES.has(name) || SECRET_WORDS.some((word) => name.includes(word));
};

// 비밀 칸 빼고 복사 (속 객체·배열까지)
// 예) { banned:true, password:'x', items:[{ token:'t', ok:1 }] } → { banned:true, items:[{ ok:1 }] }
const withoutSecrets = (value, depth = 0) => {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object' || depth > 8) return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => withoutSecrets(item, depth + 1));
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !isSecretKey(key))
        .map(([key, item]) => [key, withoutSecrets(item, depth + 1)]));
};

const clip = (value, max) => (value === undefined || value === null || value === '' ? null : String(value).slice(0, max));

// 기록 한 줄 → { id }
// adminId·ip·accessEmail은 요청 없이 도는 일(점검 강제 종료·로그인 직후)만 직접 넘김
const record = async ({
    req, action, targetType, targetId, before, after, reason, requestId, adminId, ip, accessEmail,
}, { transaction, db = defaultDb() } = {}) => {
    if (!action || AUDIT_ACTIONS[action] !== action) throw new Error(`모르는 관리자 기록 동작: ${action}`);
    const who = adminId ?? req?.admin?.id;
    if (!who) throw new Error('관리자 기록에 관리자 id가 없음');
    const meta = req?.adminRequestMeta ?? {};
    const row = await db.AdminAuditLog.create({
        admin_id: who,
        action,
        target_type: clip(targetType, TARGET_TYPE_MAX),
        target_id: clip(targetId, TARGET_ID_MAX),
        before_value: withoutSecrets(before),
        after_value: withoutSecrets(after),
        reason: clip(reason, REASON_MAX),
        ip: ip ?? meta.ip ?? (req ? getClientIp(req) : null),
        access_email: accessEmail ?? meta.accessEmail ?? null,
        request_id: clip(requestId, REQUEST_ID_MAX),
        created_at: new Date(),
    }, { transaction });
    return { id: row.id };
};

module.exports = { record, withoutSecrets };
