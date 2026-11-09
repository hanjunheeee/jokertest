'use strict';

// 회원 상세 파일, 가입일·상태·접속 중·정지 기록·받은 신고·최근 로그인 + 이메일 전체 보기
// members.controller.js가 부름, 접속 중 판단(onlineOf)·가리기(maskIp)는 회원 찾기(search.js)도 씀
const { createError } = require('../../../utils/appError');
const { maskEmail } = require('../../../utils/auth/maskEmail');
const { getServerId } = require('../../../config/serverId');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const queryQueue = require('../core/queryQueue');

const BAN_ROWS = 50;
const REPORT_ROWS = 50;
const LOGIN_ROWS = 20;

const defaultDeps = () => ({
    db: require('../../../repositories/common/db'),
    cluster: require('../../../cluster'),
    onlineUsers: require('../../../socket/emitter').onlineUsers,
    queue: queryQueue,
});

const notFound = () => createError('그런 회원이 없어요. UUID를 다시 확인해 주세요.', 404, 'MEMBER_NOT_FOUND');
const iso = (value) => (value ? new Date(value).toISOString() : null);

// 이 Node 이름 (단일 모드는 cluster를 안 켜서 설정값으로)
const selfNodeOf = (cluster) => (cluster.isEnabled() ? cluster.serverId() : getServerId(process.env));

// 접속 중 판단: 이 Node 접속 목록에 있으면 접속 중, 아니면 ONLINE 줄 + 그 줄 Node가 살아 있는 다른 Node일 때만
// 서버가 죽어 남은 ONLINE 줄(죽은 Node·내 Node인데 목록에 없음)은 접속 아님 → { online, node }
const onlineOf = ({ uuid, presenceStatus, serverId }, { cluster, onlineUsers }) => {
    if (onlineUsers.has(uuid)) return { online: true, node: selfNodeOf(cluster) };
    if (presenceStatus !== 'ONLINE' || !serverId || !cluster.isEnabled()) return { online: false, node: null };
    if (serverId === cluster.serverId() || !cluster.nodes.isAlive(serverId)) return { online: false, node: null };
    return { online: true, node: serverId };
};

// IP 가리기: 앞 두 칸만 (예: '123.45.67.89' → '123.45.*.*', '2001:db8:1::5' → '2001:db8:*', '::ffff:1.2.3.4' → '1.2.*.*')
const maskIp = (ip) => {
    if (!ip) return null;
    const text = String(ip).replace(/^::ffff:/i, '');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return `${text.split('.').slice(0, 2).join('.')}.*.*`;
    if (text.includes(':')) return `${text.split(':').slice(0, 2).join(':')}:*`;
    return '*';
};

// 정지 중인지: 시작 시각이 없거나 지났고, 영구거나 끝 시각이 안 지남 (로그인 쪽 checkActiveBan과 같은 규칙)
const isBanActive = (row, now = new Date()) => (!row.start_at || new Date(row.start_at) <= now)
    && (Boolean(row.is_permanent) || (row.end_at !== null && new Date(row.end_at) > now));

const withdrawnOf = (row) => row.deleted_at !== null || row.status === 'WITHDRAWN';

// 관리자 조회 한 번 (조회 줄 안에서, 시간 제한 붙임)
const select = (db, sql, replacements) => db.sequelize.query(queryQueue.withTimeoutHint(sql), {
    replacements, type: db.Sequelize.QueryTypes.SELECT,
});

const MEMBER_SQL = `SELECT u.uuid, u.nickname, u.email, u.status, u.role, u.created_at, u.deleted_at, u.last_login_at,
    p.status AS presence_status, p.server_id
  FROM users u LEFT JOIN online_presence p ON p.user_id = u.uuid WHERE u.uuid = :uuid`;
const BANS_SQL = `SELECT b.id, b.reason, b.is_permanent, b.start_at, b.end_at, b.banned_by, b.lifted_at, b.lifted_by, b.lift_reason,
    ab.login_id AS banned_by_login, al.login_id AS lifted_by_login
  FROM user_bans b LEFT JOIN admin_users ab ON ab.id = b.banned_by LEFT JOIN admin_users al ON al.id = b.lifted_by
  WHERE b.user_id = :uuid ORDER BY b.id DESC LIMIT ${BAN_ROWS}`;
const REPORTS_SQL = `SELECT id, reason_code, status, created_at FROM reports
  WHERE target_id = :uuid ORDER BY id DESC LIMIT ${REPORT_ROWS}`;
const LOGINS_SQL = `SELECT login_at, ip_address, success FROM login_history
  WHERE user_id = :uuid ORDER BY id DESC LIMIT ${LOGIN_ROWS}`;

// 정지 줄 → 화면 모양 (누가 정지·해제했는지 관리자 아이디 같이)
const banViewOf = (row, now) => ({
    id: row.id,
    reason: row.reason ?? null,
    isPermanent: Boolean(row.is_permanent),
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    bannedBy: row.banned_by ?? null,
    bannedByLoginId: row.banned_by_login ?? null,
    liftedAt: iso(row.lifted_at),
    liftedBy: row.lifted_by ?? null,
    liftedByLoginId: row.lifted_by_login ?? null,
    liftReason: row.lift_reason ?? null,
    active: isBanActive(row, now),
});

const memberViewOf = (row, deps) => {
    const withdrawn = withdrawnOf(row);
    const presence = withdrawn ? { online: false, node: null }
        : onlineOf({ uuid: row.uuid, presenceStatus: row.presence_status, serverId: row.server_id }, deps);
    return {
        uuid: row.uuid,
        nickname: row.nickname,
        emailMasked: maskEmail(row.email),
        status: row.status,
        role: row.role,
        online: presence.online,
        onlineNode: presence.node,
        withdrawn,
        createdAt: iso(row.created_at),
        lastLoginAt: iso(row.last_login_at),
    };
};

// 회원 상세 → { member, bans, reportsReceived, logins } (없으면 404)
const getMemberDetail = async (uuid, deps = defaultDeps()) => {
    const rows = await deps.queue.run(async () => {
        const [member] = await select(deps.db, MEMBER_SQL, { uuid });
        if (!member) return null;
        const bans = await select(deps.db, BANS_SQL, { uuid });
        const reports = await select(deps.db, REPORTS_SQL, { uuid });
        const logins = await select(deps.db, LOGINS_SQL, { uuid });
        return { member, bans, reports, logins };
    });
    if (!rows) throw notFound();
    const now = new Date();
    return {
        member: memberViewOf(rows.member, deps),
        bans: rows.bans.map((row) => banViewOf(row, now)),
        reportsReceived: rows.reports.map((row) => ({
            id: Number(row.id), reasonCode: row.reason_code, status: row.status, createdAt: iso(row.created_at),
        })),
        logins: rows.logins.map((row) => ({ at: iso(row.login_at), ipMasked: maskIp(row.ip_address), success: Boolean(row.success) })),
    };
};

// 이메일 전체 보기 → { email } + 개인정보 보기 기록 (누가 언제 봤는지 남김)
const revealEmail = async ({ req, uuid }, deps = defaultDeps()) => {
    const [row] = await deps.queue.run(() => select(deps.db, 'SELECT email FROM users WHERE uuid = :uuid', { uuid }));
    if (!row) throw notFound();
    await audit.record({
        req, action: AUDIT_ACTIONS.VIEW_PII, targetType: 'member', targetId: uuid, after: { field: 'email' },
    }, { db: deps.db });
    return { email: row.email };
};

module.exports = {
    getMemberDetail, revealEmail, onlineOf, maskIp, isBanActive, withdrawnOf, select, iso,
};
