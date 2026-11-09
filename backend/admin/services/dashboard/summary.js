'use strict';

// 운영 현황 숫자 모으기 파일, DB 숫자(가입자·오늘 끝난 판·새 신고·새 문의) + 게임 서버 숫자(진행 판·접속 수, Node 합침)
// 관리자 컨트롤러 dashboard.controller.js가 부름, 게임 서버 숫자는 기존 live 서비스 그대로 (새로 안 만듦)
const { QueryTypes } = require('sequelize');

const cluster = require('../../../cluster');
const liveService = require('../../../services/ops/live');
const maintenanceService = require('../../../services/ops/maintenance');
const queryQueue = require('../core/queryQueue');

// 한국 시각 = UTC + 9시간
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_UNAVAILABLE = 'LIVE_UNAVAILABLE';

// 오늘 시작 = 한국 0시 (예: UTC 11/10 14:59 → 한국 11/10 23:59 → UTC 11/9 15:00)
const kstDayStart = (now = new Date()) => {
    const kstMs = now.getTime() + KST_OFFSET_MS;
    return new Date(kstMs - (kstMs % DAY_MS) - KST_OFFSET_MS);
};

// 숫자 넷을 한 번에 (줄 하나 → 관리자 조회 한 번), 탈퇴는 deleted_at 채워져 빠짐
const STORED_COUNTS_SQL = queryQueue.withTimeoutHint(`SELECT
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS totalMembers,
    (SELECT COUNT(*) FROM game_results WHERE ended_at >= :since) AS finishedToday,
    (SELECT COUNT(*) FROM reports WHERE status = 'OPEN') AS openReports,
    (SELECT COUNT(*) FROM inquiries WHERE status = 'OPEN') AS openInquiries`);

// 시각 → UTC 글자 (예: 2026-11-09T15:00:00.000Z → '2026-11-09 15:00:00.000')
// Date를 그대로 넘기면 이 PC 시간대(한국)로 바뀌어 9시간 어긋남 → 표에 저장된 UTC와 맞춤
const toUtcSqlText = (date) => date.toISOString().slice(0, 23).replace('T', ' ');

// DB 숫자 → { totalMembers, finishedToday, openReports, openInquiries } (COUNT가 글자로 올 수 있어 숫자로)
const readStoredCounts = async (since) => {
    const db = require('../../../models');
    const replacements = { since: toUtcSqlText(since) };
    const [row] = await db.sequelize.query(STORED_COUNTS_SQL, { replacements, type: QueryTypes.SELECT });
    return {
        totalMembers: Number(row.totalMembers),
        finishedToday: Number(row.finishedToday),
        openReports: Number(row.openReports),
        openInquiries: Number(row.openInquiries),
    };
};

// 결과 화면(ENDED) 판은 이미 끝나 저장된 판이라 진행 중에서 뺌 (오늘 총 판 수 두 번 세기 막기)
const countInProgress = (games = []) => games.filter((game) => game?.phase !== 'ENDED').length;

// 게임 서버 숫자 → { inProgress, onlineCount, live? } / 못 받으면 { liveError, live? }
// Node 여러 개면 전 Node 합침, 일부 Node만 못 받으면 받은 것 합 + partial
const readLiveCounts = async () => {
    try {
        if (!cluster.isEnabled()) {
            const own = liveService.getLiveSummary();
            return { inProgress: countInProgress(own.games), onlineCount: own.onlineCount ?? 0 };
        }
        const merged = await liveService.getClusterLiveSummary();
        const live = { partial: merged.partial === true, nodes: merged.nodes ?? [] };
        if (!live.nodes.some((line) => line.ok)) return { liveError: LIVE_UNAVAILABLE, live };
        return { inProgress: countInProgress(merged.games), onlineCount: merged.onlineCount ?? 0, live };
    } catch (error) {
        console.warn('[admin dashboard] 게임 서버 숫자 못 받음', error?.code ?? error?.message);
        return { liveError: LIVE_UNAVAILABLE };
    }
};

// 점검은 첫 화면엔 켜짐·진행 중·시작 시각만
const pickMaintenance = () => {
    const { enabled, active, startsAt } = maintenanceService.getMaintenanceState();
    return { enabled, active, startsAt };
};

// 운영 현황 전체 (DB 숫자 실패는 던짐 → 관리자 오류 처리기, 게임 서버 숫자 실패는 null + liveError)
const getDashboardSummary = async ({ now = new Date() } = {}) => {
    const since = kstDayStart(now);
    const [stored, liveCounts] = await Promise.all([
        queryQueue.run(() => module.exports.readStoredCounts(since)),
        readLiveCounts(),
    ]);
    const inProgress = liveCounts.liveError ? null : liveCounts.inProgress;
    return {
        totalMembers: stored.totalMembers,
        todayGames: {
            finished: stored.finishedToday,
            inProgress,
            total: inProgress === null ? null : stored.finishedToday + inProgress,
        },
        inProgressGames: inProgress,
        onlineCount: liveCounts.liveError ? null : liveCounts.onlineCount,
        openReports: stored.openReports,
        openInquiries: stored.openInquiries,
        maintenance: pickMaintenance(),
        ...(liveCounts.live ? { live: liveCounts.live } : {}),
        ...(liveCounts.liveError ? { liveError: liveCounts.liveError } : {}),
    };
};

module.exports = { LIVE_UNAVAILABLE, kstDayStart, readStoredCounts, getDashboardSummary };
