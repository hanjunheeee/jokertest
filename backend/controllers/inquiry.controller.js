// 플레이어 문의 처리기 파일, 쓰기·내 목록·상세 (로그인한 본인 uuid로만)
// routes/inquiry.routes.js가 부름, 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게
const write = require("../services/inquiry/write");
const read  = require("../services/inquiry/read");

// 문의 쪽 오류 코드 (이것만 { ok:false, code, message }로, 나머지는 공용 오류 처리기)
const INQUIRY_ERROR_CODES = new Set(["INVALID_INQUIRY", "INQUIRY_RATE_LIMITED", "INQUIRY_OPEN_LIMIT", "INQUIRY_NOT_FOUND"]);

const respondError = (error, res, next) => {
    if (error?.name === "AppError" && INQUIRY_ERROR_CODES.has(error.code)) {
        return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    return next(error);
};

// POST /inquiries: 본문 { category, title, body }
exports.createInquiry = async (req, res, next) => {
    try {
        const inquiry = await write.createInquiry({ userId: req.user.uuid, body: req.body });
        res.status(201).json({ ok: true, inquiry });
    } catch (error) { respondError(error, res, next); }
};

// GET /inquiries: 내 문의 최근 50개
exports.listInquiries = async (req, res, next) => {
    try {
        const inquiries = await read.listMyInquiries({ userId: req.user.uuid });
        res.json({ ok: true, inquiries });
    } catch (error) { respondError(error, res, next); }
};

// GET /inquiries/:id: 내 문의 상세 + 답
exports.getInquiry = async (req, res, next) => {
    try {
        const inquiry = await read.getMyInquiry({ userId: req.user.uuid, inquiryId: req.params.id });
        res.json({ ok: true, inquiry });
    } catch (error) { respondError(error, res, next); }
};
