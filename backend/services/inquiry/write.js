'use strict';

// 플레이어 문의 쓰기 파일, 모양 검사 → 너무 자주·답 기다림 수 확인 → 금지어 가려 저장
// controllers/inquiry.controller.js가 부름, 제한은 DB에 쌓인 내 문의로 셈 (Node 여러 개여도 같은 수)
const { Op } = require('sequelize');
const read = require('./read');

const INQUIRY_CATEGORIES = Object.freeze(['BUG', 'ACCOUNT', 'ETC']);
// 한 사람 1분 2번·하루(24시간) 10번·답 기다림 5개까지
const INQUIRY_LIMITS = Object.freeze({ perMinute: 2, perDay: 10, open: 5 });
const MAX_TITLE = 100;
const MAX_BODY = 2000;
const ALLOWED_FIELDS = Object.freeze(['category', 'title', 'body']);
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const defaultDeps = () => ({
    db: require('../../repositories/common/db'),
    bannedWords: require('../ops/bannedWords'),
    now: () => new Date(),
});

const invalid = (message) => read.inquiryError(message, 400, 'INVALID_INQUIRY');

// 글 칸 하나: 앞뒤 공백 뺀 뒤 1~max자
const textField = (value, max, label) => {
    if (typeof value !== 'string') throw invalid(`${label}을 적어 주세요.`);
    const trimmed = value.trim();
    if (trimmed.length === 0) throw invalid(`${label}을 적어 주세요.`);
    if (trimmed.length > max) throw invalid(`${label}은 ${max}자까지예요.`);
    return trimmed;
};

// 요청 모양 검사 (모르는 칸·종류 목록·제목 100·본문 2000) → { category, title, body }
const validateInquiry = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('문의 내용을 적어 주세요.');
    if (Object.keys(input).some((key) => !ALLOWED_FIELDS.includes(key))) throw invalid('알 수 없는 칸이 있어요.');
    if (!INQUIRY_CATEGORIES.includes(input.category)) throw invalid('문의 종류를 골라 주세요.');
    return {
        category: input.category,
        title: textField(input.title, MAX_TITLE, '제목'),
        body: textField(input.body, MAX_BODY, '내용'),
    };
};

// 금지어 가리기 (가리다 던지면 원문 그대로, 채팅과 같은 처리)
const masked = (text, bannedWords) => {
    try { return bannedWords.maskBannedWords(text); } catch { return text; }
};

// 1분·하루 쓴 수, 답 기다림 수 확인 (넘으면 429·409)
const checkLimits = async (userId, nowMs, { db, transaction }) => {
    const since = (ms) => ({ user_id: userId, created_at: { [Op.gt]: new Date(nowMs - ms) } });
    const tooOften = () => read.inquiryError('문의를 너무 자주 썼어요. 잠시 뒤에 다시 써 주세요.', 429, 'INQUIRY_RATE_LIMITED');
    if (await db.Inquiry.count({ where: since(MINUTE_MS), transaction }) >= INQUIRY_LIMITS.perMinute) throw tooOften();
    if (await db.Inquiry.count({ where: since(DAY_MS), transaction }) >= INQUIRY_LIMITS.perDay) throw tooOften();
    const open = await db.Inquiry.count({ where: { user_id: userId, status: read.INQUIRY_STATUS.OPEN }, transaction });
    if (open >= INQUIRY_LIMITS.open) {
        throw read.inquiryError(`답을 기다리는 문의가 ${INQUIRY_LIMITS.open}개예요. 답을 받은 뒤에 써 주세요.`, 409, 'INQUIRY_OPEN_LIMIT');
    }
};

// 문의 쓰기 → 상세 모양 (답은 아직 없음)
// 같은 사람 요청이 동시에 와도 수가 안 넘게 사용자 줄을 잠그고 셈
const createInquiry = async ({ userId, body }, deps = defaultDeps()) => {
    const input = validateInquiry(body);
    const now = deps.now();
    const row = await deps.db.sequelize.transaction(async (transaction) => {
        await deps.db.User.findOne({ where: { uuid: userId }, attributes: ['uuid'], transaction, lock: transaction.LOCK.UPDATE });
        await checkLimits(userId, now.getTime(), { db: deps.db, transaction });
        return deps.db.Inquiry.create({
            user_id: userId,
            category: input.category,
            title: masked(input.title, deps.bannedWords),
            body: masked(input.body, deps.bannedWords),
            status: read.INQUIRY_STATUS.OPEN,
            created_at: now,
            updated_at: now,
        }, { transaction });
    });
    return read.inquiryView(row, []);
};

module.exports = {
    INQUIRY_CATEGORIES,
    INQUIRY_LIMITS,
    MAX_TITLE,
    MAX_BODY,
    inquiryError: read.inquiryError,
    validateInquiry,
    createInquiry,
};
