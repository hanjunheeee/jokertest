'use strict';

// 상품 경로 처리 파일, 요청 모양 검사 한 번(모르는 칸 거절) → 상품 서비스 → 응답 (값 규칙은 서비스가 INVALID_PRODUCT로)
// products.routes.js가 붙임 (GET 목록 · POST 만들기 · PATCH 고치기), 응답 모양은 경계.md 2-7
const { createError } = require('../../utils/appError');
const products = require('../services/products/manage');

const CREATE_FIELDS = Object.freeze([
    'productId', 'kind', 'displayName', 'payCurrency', 'payAmount', 'grantCurrency', 'grantAmount', 'bonusAmount', 'status', 'sortOrder',
]);

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

const readProductId = (value) => {
    if (typeof value !== 'string' || !products.PRODUCT_ID_PATTERN.test(value)) throw invalid('productId');
    return value;
};

// GET /admin-api/products → { ok, items }
exports.list = async (req, res) => {
    res.json({ ok: true, ...(await products.listProducts()) });
};

// POST /admin-api/products → 201 { ok, product }
exports.create = async (req, res) => {
    const input = readBody(req.body, CREATE_FIELDS);
    res.status(201).json({ ok: true, ...(await products.createProduct({ req, input })) });
};

// PATCH /admin-api/products/:productId { expectedVersion, ...바꿀 칸 } → { ok, product }
exports.update = async (req, res) => {
    const productId = readProductId(req.params?.productId);
    const { expectedVersion, ...changes } = readBody(req.body, ['expectedVersion', ...products.EDITABLE]);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw invalid('expectedVersion');
    if (Object.keys(changes).length === 0) throw invalid('body');
    res.json({ ok: true, ...(await products.updateProduct({ req, productId, expectedVersion, changes })) });
};
