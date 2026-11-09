'use strict';

// 신고 접수 파일, 모양 검사 → 같은 판에 둘 다 있었는지 → 같은 판 같은 대상 중복 막기 → 신고 저장 + 채팅 증거 저장
// controllers/ops/report.js가 부름, 처리(OPEN → RESOLVED·DISMISSED)는 관리자 서버 몫
// 판이 다른 Node에 있으면 판 Node에 RPC로 물음 (gameLookup.js), 못 물으면 DB만·증거 없이
const { createError } = require('../../utils/appError');
const { isUniqueConstraintName } = require('../../repositories/common');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const REPORT_REASON_CODES = Object.freeze(['ABUSE', 'SPAM', 'GRIEFING', 'CHEATING', 'NICKNAME', 'ETC']);
const MAX_MEMO = 500;
const ALLOWED_FIELDS = Object.freeze(['targetUuid', 'gameId', 'reasonCode', 'memo']);

const defaultDeps = () => ({
    db: require('../../repositories/common/db'),
    gameSessions: require('../../game-core/core/registry/state').gameSessions,
    chatBuffer: require('./chatBuffer'),
    gameLookup: require('./gameLookup'),
    now: () => new Date(),
});

// 요청 모양 검사 (모르는 칸·uuid 모양·사유 목록·메모 길이)
const validateReport = (body, reporterId) => {
    const input = body ?? {};
    const unknown = Object.keys(input).filter((key) => !ALLOWED_FIELDS.includes(key));
    if (unknown.length > 0) throw createError('허용되지 않은 칸이 있습니다.', 400, 'INVALID_REPORT');
    const { targetUuid, gameId, reasonCode, memo } = input;
    if (typeof targetUuid !== 'string' || !UUID_PATTERN.test(targetUuid)) {
        throw createError('신고 대상이 올바르지 않습니다.', 400, 'INVALID_REPORT');
    }
    if (typeof gameId !== 'string' || !UUID_PATTERN.test(gameId)) {
        throw createError('판 id가 올바르지 않습니다.', 400, 'INVALID_REPORT');
    }
    if (!REPORT_REASON_CODES.includes(reasonCode)) {
        throw createError('신고 사유가 올바르지 않습니다.', 400, 'INVALID_REPORT');
    }
    if (memo !== undefined && memo !== null && (typeof memo !== 'string' || memo.length > MAX_MEMO)) {
        throw createError(`메모는 ${MAX_MEMO}자까지입니다.`, 400, 'INVALID_REPORT');
    }
    if (targetUuid.toLowerCase() === String(reporterId).toLowerCase()) {
        throw createError('자기 자신은 신고할 수 없습니다.', 400, 'SELF_REPORT');
    }
    const trimmedMemo = typeof memo === 'string' && memo.trim() ? memo.trim() : null;
    return { targetUuid, gameId, reasonCode, memo: trimmedMemo };
};

// 둘 다 그 판에 있었는지: 이 Node 메모리 판 → 다른 Node 진행 판(RPC) → 저장된 판 결과
const bothPlayedIn = async (gameId, reporterId, targetUuid, deps) => {
    const session = deps.gameSessions.get(gameId);
    if (session?.players instanceof Map) {
        return session.players.has(reporterId) && session.players.has(targetUuid);
    }
    const remote = deps.gameLookup ? await deps.gameLookup.remoteParticipants(gameId, [reporterId, targetUuid]) : null;
    if (remote) return remote.both === true;
    const count = await deps.db.GameResultPlayer.count({ where: { game_id: gameId, user_id: [reporterId, targetUuid] } });
    return count === 2;
};

const duplicateReport = () => createError('이미 신고한 대상입니다.', 409, 'DUPLICATE_REPORT');

// 신고 접수
const submitReport = async ({ reporterId, body }, deps = defaultDeps()) => {
    const report = validateReport(body, reporterId);
    if (!(await bothPlayedIn(report.gameId, reporterId, report.targetUuid, deps))) {
        throw createError('같이 한 판을 찾을 수 없습니다.', 404, 'GAME_NOT_FOUND');
    }
    const existing = await deps.db.Report.findOne({
        where: { reporter_id: reporterId, target_id: report.targetUuid, game_id: report.gameId },
    });
    if (existing) throw duplicateReport();

    let row;
    try {
        row = await deps.db.Report.create({
            reporter_id: reporterId,
            target_id: report.targetUuid,
            game_id: report.gameId,
            reason_code: report.reasonCode,
            memo: report.memo,
            status: 'OPEN',
            created_at: deps.now(),
        });
    } catch (error) {
        // 동시 신고가 앞 검사를 같이 지나쳐도 유일 제약이 막음
        if (isUniqueConstraintName(error)) throw duplicateReport();
        throw error;
    }
    const reportId = row?.id ?? (typeof row?.get === 'function' ? row.get('id') : null);

    // 채팅 증거: 실패해도 신고는 남김 (증거 없는 신고도 관리자가 봄)
    let evidenceSaved = false;
    try {
        evidenceSaved = await saveChatEvidence({ reportId, gameId: report.gameId }, deps);
    } catch (error) {
        console.error('[신고 채팅 증거 저장 실패]', error?.name ?? 'Error');
    }
    return { reportId, evidenceSaved };
};

// 판 채팅 묶음 저장: 이 Node 버퍼 → 없으면 판 Node 버퍼(RPC) → 그래도 없으면 저장 안 함
const saveChatEvidence = async ({ reportId, gameId }, deps) => {
    let messages = deps.chatBuffer.getGameChatMessages(gameId);
    if ((!Array.isArray(messages) || messages.length === 0) && deps.gameLookup) {
        messages = await deps.gameLookup.remoteChatEvidence(gameId);
    }
    if (!Array.isArray(messages) || messages.length === 0 || reportId === null || reportId === undefined) return false;
    await deps.db.ReportChatEvidence.create({ report_id: reportId, game_id: gameId, messages, saved_at: deps.now() });
    return true;
};

module.exports = {
    REPORT_REASON_CODES,
    MAX_MEMO,
    validateReport,
    submitReport,
};
