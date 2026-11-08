// 내부 API 처리기 파일, 관리자 서버가 부르는 끊기·공지·점검/금지어 다시 읽기·지금 상황
// routes/internal.routes.js가 부름 (열쇠 확인은 앞 미들웨어 몫), 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게
const disconnectService = require("../../services/ops/disconnect");
const announcementService = require("../../services/ops/announcements");
const maintenanceService = require("../../services/ops/maintenance");
const bannedWordService = require("../../services/ops/bannedWords");
const liveService = require("../../services/ops/live");

// POST /internal/users/:uuid/disconnect: 정지·비활성 반영 즉시 끊기
exports.disconnectUser = async (req, res, next) => {
    try {
        const result = await disconnectService.disconnectUser(req.params.uuid);
        res.json({ ok: true, ...result });
    } catch (error) { next(error); }
};

// POST /internal/announcements: 접속자 전체 또는 uuid 목록에 공지 알림
exports.sendAnnouncement = async (req, res, next) => {
    try {
        const result = await announcementService.sendAnnouncement(req.body ?? {});
        res.json({ ok: true, ...result });
    } catch (error) { next(error); }
};

// POST /internal/maintenance/reload: 점검 한 줄 다시 읽기
exports.reloadMaintenance = async (req, res, next) => {
    try {
        const state = await maintenanceService.reloadMaintenance();
        res.json({ ok: true, maintenance: state });
    } catch (error) { next(error); }
};

// POST /internal/banned-words/reload: 금지어 다시 읽기
exports.reloadBannedWords = async (req, res, next) => {
    try {
        const result = await bannedWordService.reloadBannedWords();
        res.json({ ok: true, ...result });
    } catch (error) { next(error); }
};

// GET /internal/live: 대기방·진행 판 요약 (명단·닉네임 없음)
exports.getLive = async (req, res, next) => {
    try {
        const summary = await liveService.getLiveSummary();
        res.json({ ok: true, ...summary, maintenance: maintenanceService.getMaintenanceState() });
    } catch (error) { next(error); }
};
