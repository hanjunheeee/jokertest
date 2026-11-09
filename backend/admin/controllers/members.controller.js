'use strict';

// 회원 찾기·상세 경로 처리 파일, 요청 모양 검사 한 번 → 서비스 → 응답
// members.routes.js가 붙임 (GET / · GET /:uuid · POST /:uuid/reveal-email), 응답 모양은 경계.md 1-1
const { createError } = require('../../utils/appError');
const { searchMembers, searchKindOf } = require('../services/members/search');
const { getMemberDetail, revealEmail } = require('../services/members/detail');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SEARCH_FIELDS = new Set(['q', 'before', 'limit']);
const Q_MAX = 100;
const LIMIT_MAX = 50;

const invalid = (field, message = '입력한 값을 다시 확인해 주세요.') => {
    const error = createError(message, 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// 주소의 uuid 모양 (틀리면 없는 회원과 같게 404)
const readUuid = (params) => {
    const uuid = String(params.uuid ?? '');
    if (!UUID_PATTERN.test(uuid)) throw createError('그런 회원이 없어요. UUID를 다시 확인해 주세요.', 404, 'MEMBER_NOT_FOUND');
    return uuid.toLowerCase();
};

// 찾기 조건: q(필수) · before(앞 목록 마지막 닉네임) · limit(1~50), 모르는 칸 거절
const readSearchQuery = (query) => {
    const unknown = Object.keys(query).find((key) => !SEARCH_FIELDS.has(key));
    if (unknown) throw invalid(unknown);
    const q = typeof query.q === 'string' ? query.q.trim() : '';
    if (!q || q.length > Q_MAX || !searchKindOf(q)) {
        throw invalid('q', 'UUID, 이메일 전체, 또는 닉네임 앞 2글자 이상을 넣어 주세요.');
    }
    if (query.before !== undefined && (typeof query.before !== 'string' || query.before.length > Q_MAX)) throw invalid('before');
    const limit = query.limit === undefined ? LIMIT_MAX : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) throw invalid('limit');
    return { q, before: query.before || null, limit };
};

// GET /admin-api/members?q=&before=&limit= → { items, nextBefore }
exports.search = async (req, res) => {
    const found = await searchMembers(readSearchQuery(req.query));
    res.json({ ok: true, ...found });
};

// GET /admin-api/members/:uuid → { member, bans, reportsReceived, logins }
exports.detail = async (req, res) => {
    const detail = await getMemberDetail(readUuid(req.params));
    res.json({ ok: true, ...detail });
};

// POST /admin-api/members/:uuid/reveal-email → { email } (+ 개인정보 보기 기록)
exports.revealEmail = async (req, res) => {
    const shown = await revealEmail({ req, uuid: readUuid(req.params) });
    res.json({ ok: true, ...shown });
};
