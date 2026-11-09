'use strict';

// 운영 현황 경로 처리 파일, GET /admin-api/dashboard → 숫자 모으기 서비스 → { ok:true, ...숫자 }
// dashboard.routes.js가 붙임, 응답 모양은 경계.md 1-5 (받는 칸 없음 → 검사할 몸·주소 칸 없음)
const summary = require('../services/dashboard/summary');

// 게임 서버 숫자 못 받아도 200 (그 칸만 null + liveError), DB 숫자 실패는 관리자 오류 처리기로
exports.getDashboard = async (req, res, next) => {
    try {
        res.json({ ok: true, ...(await summary.getDashboardSummary()) });
    } catch (error) { next(error); }
};
