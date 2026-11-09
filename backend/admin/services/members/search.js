'use strict';

// 회원 찾기 파일, UUID 같음 · 이메일 같음 · 닉네임 앞부분으로 찾아 목록 50줄씩 (이메일은 가려서)
// members.controller.js가 부름 (q 모양 검사는 컨트롤러가 한 번), 접속 중 판단은 detail.js 것 그대로
const { maskEmail } = require('../../../utils/auth/maskEmail');
const { onlineOf, withdrawnOf, select, iso } = require('./detail');
const queryQueue = require('../core/queryQueue');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NICKNAME_MIN = 2;

const defaultDeps = () => ({
    db: require('../../../repositories/common/db'),
    cluster: require('../../../cluster'),
    onlineUsers: require('../../../socket/emitter').onlineUsers,
    queue: queryQueue,
});

// q 모양 → 찾는 방법 (예: '1b2c…-…' → uuid, 'a@b.com' → email, '가면' → nickname, '가' → null(짧음))
const searchKindOf = (q) => {
    if (UUID_PATTERN.test(q)) return 'uuid';
    if (q.includes('@')) return 'email';
    return q.length >= NICKNAME_MIN ? 'nickname' : null;
};

// LIKE 특수 글자 막기 (예: '50%_가' → '50\%\_가')
const escapeLike = (text) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

// 지금 정지 중인지 (로그인 쪽 checkActiveBan과 같은 규칙)
const ACTIVE_BAN_SQL = `EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.uuid
    AND (b.start_at IS NULL OR b.start_at <= :now) AND (b.is_permanent = 1 OR b.end_at > :now))`;

// 찾는 방법마다 조건 (닉네임은 가나다순 커서: before = 앞 목록 마지막 닉네임)
const CONDITIONS = Object.freeze({
    uuid: 'u.uuid = :q',
    email: 'u.email = :q',
    nickname: 'u.nickname LIKE :prefix AND (:before IS NULL OR u.nickname > :before)',
});

const buildSql = (kind) => `SELECT u.uuid, u.nickname, u.email, u.status, u.created_at, u.deleted_at,
    p.status AS presence_status, p.server_id, ${ACTIVE_BAN_SQL} AS banned
  FROM users u LEFT JOIN online_presence p ON p.user_id = u.uuid
  WHERE ${CONDITIONS[kind]} ORDER BY u.nickname ASC LIMIT :take`;

const itemOf = (row, deps) => {
    const withdrawn = withdrawnOf(row);
    const presence = withdrawn ? { online: false }
        : onlineOf({ uuid: row.uuid, presenceStatus: row.presence_status, serverId: row.server_id }, deps);
    return {
        uuid: row.uuid,
        nickname: row.nickname,
        emailMasked: maskEmail(row.email),
        status: row.status,
        online: presence.online,
        banned: Boolean(Number(row.banned)),
        withdrawn,
        createdAt: iso(row.created_at),
    };
};

// 회원 찾기 → { items, nextBefore } (한 줄 더 읽어 다음이 있는지 봄, 없으면 nextBefore null)
const searchMembers = async ({ q, before = null, limit = 50 }, deps = defaultDeps()) => {
    const kind = searchKindOf(q);
    const rows = await deps.queue.run(() => select(deps.db, buildSql(kind), {
        q, prefix: `${escapeLike(q)}%`, before: kind === 'nickname' ? before : null, take: limit + 1, now: new Date(),
    }));
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit && kind === 'nickname';
    return {
        items: page.map((row) => itemOf(row, deps)),
        nextBefore: hasMore ? page[page.length - 1].nickname : null,
    };
};

module.exports = { searchMembers, searchKindOf, escapeLike, NICKNAME_MIN };
