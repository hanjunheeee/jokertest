'use strict';

// 쿠폰 경로 처리 파일, 요청 모양 검사 한 번(모르는 칸 거절) → 쿠폰 서비스 → 응답 (값 규칙은 서비스가 INVALID_COUPON으로)
// coupons.routes.js가 붙임 (목록 · 만들기 · 켜고 끄기 · 쓴 사람), 응답 모양은 경계.md 2-9
const { createError } = require('../../utils/appError');
const coupons = require('../services/coupons/manage');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CREATE_FIELDS = Object.freeze(['code', 'rewardType', 'rewardAmount', 'maxUses', 'startsAt', 'endsAt']);

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

const readBody = (body, allowed) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !allowed.includes(key));
    if (unknown) throw invalid(unknown);
    return body;
};

// 양의 정수 글자 → 수 (예: '12' → 12, 'x'·'0' → null)
const positiveInt = (value) => (/^[1-9]\d{0,15}$/.test(String(value)) ? Number(value) : null);

const readLimit = (value) => {
    if (value === undefined || value === '') return undefined;
    const limit = positiveInt(value);
    if (!limit || limit > 50) throw invalid('limit');
    return limit;
};

const readId = (params) => {
    const id = positiveInt(params?.id);
    if (!id) throw invalid('id');
    return id;
};

// 빈 칸은 빼고 넘김 (서비스 기본값이 먹게)
const withoutEmpty = (input) => Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

// GET /admin-api/coupons → { ok, items, nextBefore }
exports.list = async (req, res) => {
    const before = req.query?.before === undefined || req.query.before === '' ? undefined : positiveInt(req.query.before);
    if (before === null) throw invalid('before');
    res.json({ ok: true, ...(await coupons.listCoupons(withoutEmpty({ before, limit: readLimit(req.query?.limit) }))) });
};

// POST /admin-api/coupons → 201 { ok, coupon }
exports.create = async (req, res) => {
    const input = readBody(req.body, CREATE_FIELDS);
    res.status(201).json({ ok: true, ...(await coupons.createCoupon({ req, input })) });
};

// PATCH /admin-api/coupons/:id { isActive } → { ok, coupon }
exports.toggle = async (req, res) => {
    const id = readId(req.params);
    const { isActive } = readBody(req.body, ['isActive']);
    if (typeof isActive !== 'boolean') throw invalid('isActive');
    res.json({ ok: true, ...(await coupons.toggleCoupon({ req, id, isActive })) });
};

// GET /admin-api/coupons/:id/redemptions → { ok, items, nextBefore }
exports.redemptions = async (req, res) => {
    const id = readId(req.params);
    const before = req.query?.before;
    if (before !== undefined && before !== '' && (typeof before !== 'string' || !UUID_PATTERN.test(before))) throw invalid('before');
    const input = withoutEmpty({ id, before: before || undefined, limit: readLimit(req.query?.limit) });
    res.json({ ok: true, ...(await coupons.listRedemptions(input)) });
};
