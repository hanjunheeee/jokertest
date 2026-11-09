'use strict';

// 관리자 점검 서비스 파일, 점검 보기(상태·남은 판·방·Node별 강제 종료 결과) + 점검 저장(DB·기록 → 전 Node 다시 읽기)
// maintenance.controller.js가 부름, 시작 시각 강제 종료 결과는 점검 시계 알림을 받아 Node마다 기록 MAINTENANCE_FORCE_END
const audit = require('../core/audit');
const queryQueue = require('../core/queryQueue');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const liveService = require('../../../services/ops/live');
const { reloadEverywhere } = require('../../../services/ops/reloadSync');
const maintenanceClock = require('../../../services/ops/maintenanceClock');

const defaultDb = () => require('../../../repositories/common/db');

const ROW_ID = 1;
// Node별 강제 종료 결과는 최근 기록 몇 줄만 봄 (Node 수보다 넉넉히)
const FORCE_END_LOOKBACK = 20;

const toIso = (value) => (value ? new Date(value).toISOString() : null);

// DB 줄 → 응답 모양 (줄 없으면 꺼짐)
// 예: { is_enabled:1, starts_at:2026-11-10 03:00 } → { enabled:true, active:true(지났으면), startsAt:'2026-11-10T03:00:00.000Z', … }
const toMaintenance = (row, now = new Date()) => {
    const plain = row && typeof row.get === 'function' ? row.get({ plain: true }) : row;
    const enabled = Boolean(plain?.is_enabled);
    const startsAt = toIso(plain?.starts_at);
    return {
        enabled,
        active: enabled && (!startsAt || Date.parse(startsAt) <= now.getTime()),
        message: plain?.message ?? null,
        startsAt,
        endsAt: toIso(plain?.ends_at),
        updatedAt: toIso(plain?.updated_at),
    };
};

// 남은 판(결과 화면 판 빼고)·열린 방 수, 전 Node 합침 → 못 물으면 null + liveError
const countLive = async () => {
    try {
        const summary = await liveService.getClusterLiveSummary();
        return {
            liveGames: summary.games.filter((game) => game.phase !== 'ENDED').length,
            liveRooms: summary.roomCount,
            liveNodes: summary.nodes,
            livePartial: Boolean(summary.partial),
        };
    } catch {
        return { liveGames: null, liveRooms: null, liveNodes: [], livePartial: true, liveError: 'LIVE_UNAVAILABLE' };
    }
};

// 관리자 조회라 시간 제한 붙인 SQL로 읽되, 모델 모양(JSON 칸 풀기 등)은 findAll과 같게
const selectAsModel = (db, model, sql, replacements) => db.sequelize.query(queryQueue.withTimeoutHint(sql), {
    replacements, model, mapToModel: true,
});

// 지금 시작 시각의 Node별 강제 종료 결과 (기록에서)
// 예: [{ node:'n1', games:2, rooms:1, at:'…' }, { node:'n2', games:0, rooms:0, at:'…' }]
const readForceEnds = async (startsAt, db) => {
    if (!startsAt) return [];
    const rows = await selectAsModel(db, db.AdminAuditLog, `SELECT * FROM admin_audit_logs WHERE action = :action
        ORDER BY id DESC LIMIT :limit`, { action: AUDIT_ACTIONS.MAINTENANCE_FORCE_END, limit: FORCE_END_LOOKBACK });
    return rows
        .map((row) => ({ ...(row.after_value ?? {}), at: toIso(row.created_at) }))
        .filter((report) => report.startsAt === startsAt)
        .map(({ node, games, rooms, at }) => ({ node, games, rooms, at }));
};

// GET: 점검 상태 + 남은 판·방 + Node별 강제 종료 결과
const getMaintenance = async ({ db = defaultDb() } = {}) => {
    const { maintenance, forceEnds } = await queryQueue.run(async () => {
        const [row] = await selectAsModel(db, db.MaintenanceState, 'SELECT * FROM maintenance_state WHERE id = :id', { id: ROW_ID });
        const current = toMaintenance(row);
        return { maintenance: current, forceEnds: await readForceEnds(current.startsAt, db) };
    });
    return { maintenance, ...(await countLive()), forceEnds };
};

// 저장할 값 다듬기: 초 단위로 자름(DATETIME이 소수 초를 반올림해 화면 값과 어긋나지 않게), 켤 때 과거 시작 시각은 지금으로
const normalize = ({ enabled, message, startsAt, endsAt }, now) => {
    const second = (date) => (date ? new Date(Math.floor(date.getTime() / 1000) * 1000) : null);
    let start = second(startsAt);
    if (enabled && start && start.getTime() < now.getTime()) start = second(now);
    return {
        is_enabled: enabled,
        message: message ? message : null,
        starts_at: start,
        ends_at: second(endsAt),
    };
};

// PUT: 한 트랜잭션에 점검 한 줄 고침 + 기록 → 커밋 뒤 전 Node 다시 읽기(시계·큰 안내도 따라 바뀜)
const updateMaintenance = async ({ req, enabled, message, startsAt, endsAt }, { db = defaultDb(), now = new Date() } = {}) => {
    const values = normalize({ enabled, message, startsAt, endsAt }, now);
    const saved = await db.sequelize.transaction(async (transaction) => {
        const row = await db.MaintenanceState.findOne({ where: { id: ROW_ID }, transaction, lock: transaction.LOCK.UPDATE });
        const before = row ? toMaintenance(row, now) : null;
        const changes = { ...values, updated_by_admin_id: req.admin.id, updated_at: now };
        if (row) await row.update(changes, { transaction });
        else await db.MaintenanceState.create({ id: ROW_ID, ...changes }, { transaction });
        const after = toMaintenance({ ...changes }, now);
        await audit.record({
            req, action: AUDIT_ACTIONS.MAINTENANCE_UPDATE, targetType: 'maintenance', targetId: String(ROW_ID), before, after,
        }, { transaction, db });
        return after;
    });
    const { nodes, partial } = await reloadEverywhere('maintenance');
    return { maintenance: saved, nodes, partial };
};

// 시작 시각 강제 종료 결과 → 이 Node 기록 한 줄 (요청 없이 돌아서 관리자 = 마지막으로 점검을 고친 관리자)
const recordForceEnd = async (report, { db = defaultDb() } = {}) => {
    const row = await db.MaintenanceState.findOne({ where: { id: ROW_ID } });
    const adminId = row?.updated_by_admin_id ?? null;
    if (!adminId) {
        console.warn('[점검 강제 종료 기록 건너뜀] 점검을 고친 관리자 없음', report);
        return null;
    }
    return audit.record({
        action: AUDIT_ACTIONS.MAINTENANCE_FORCE_END,
        adminId,
        targetType: 'maintenance',
        targetId: report.node,
        after: { node: report.node, games: report.games, rooms: report.rooms, startsAt: report.startsAt },
    }, { db });
};

// 점검 시계가 끝낼 때마다 기록 (실패는 로그만, 판 끝내기는 이미 끝남)
maintenanceClock.onForceEnd((report) => {
    module.exports.recordForceEnd(report).catch((error) => console.error('[점검 강제 종료 기록 실패]', error?.name ?? 'Error'));
});

module.exports = { getMaintenance, updateMaintenance, recordForceEnd, toMaintenance };
