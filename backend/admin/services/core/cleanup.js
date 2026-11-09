'use strict';

// 관리자 표 정리 파일, 끝난 세션·90일 지난 로그인 시도·90일 지난 신고 채팅 증거 지움
// runAdminCleanup은 시험·직접 부르기, startAdminCleanup은 서버 시작 때 한 번 (Node마다 돌아도 지우기만이라 겹쳐도 됨)
const { Op } = require('sequelize');

const { sessionIdleMs } = require('../../config');
const { purgeExpiredChatEvidence } = require('../../../services/ops/evidenceRetention');

const defaultDb = () => require('../../../repositories/common/db');

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTEMPT_KEEP_DAYS = 90;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

// 한 번 정리 → { sessions, attempts, evidence } (지운 줄 수)
const runAdminCleanup = async ({ now = new Date(), db = defaultDb() } = {}) => {
    const idleCut = new Date(now.getTime() - sessionIdleMs());
    // 끝난 세션: 12시간 지남 · 로그아웃·끊김 · 가만히 30분 지남
    const sessions = await db.AdminSession.destroy({
        where: {
            [Op.or]: [
                { expires_at: { [Op.lte]: now } },
                { revoked_at: { [Op.ne]: null } },
                { last_seen_at: { [Op.lte]: idleCut } },
            ],
        },
    });
    const attempts = await db.AdminLoginAttempt.destroy({
        where: { created_at: { [Op.lt]: new Date(now.getTime() - ATTEMPT_KEEP_DAYS * DAY_MS) } },
    });
    const { deleted: evidence } = await purgeExpiredChatEvidence({ db, now: () => now });
    return { sessions, attempts, evidence };
};

// 6시간마다 정리 (서버 끄는 걸 막지 않게 unref), 멈추는 함수 돌려줌
const startAdminCleanup = ({ intervalMs = INTERVAL_MS } = {}) => {
    const tick = () => runAdminCleanup().catch((error) => {
        console.warn('[ADMIN] 관리자 표 정리 실패 —', error?.name ?? 'Error');
    });
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
};

module.exports = { runAdminCleanup, startAdminCleanup };
