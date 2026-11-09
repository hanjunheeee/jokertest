'use strict';

// 골드·다이아 주고 뺏기 경로 처리 파일, 요청 모양 검사 한 번 → 지갑 서비스 → 응답
// wallet.routes.js가 붙임 (GET 지갑 · POST 주고 뺏기), 응답 모양은 경계.md 2-8
const { createError } = require('../../utils/appError');
const { MAX_BALANCE } = require('../../services/economy/constants');
const wallet = require('../services/wallet/adjust');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCIES = ['GOLD', 'DIAMOND'];
const REASON_MAX = 200;

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

const reasonRequired = () => {
    const error = createError('사유를 1~200자로 적어 주세요.', 400, 'REASON_REQUIRED');
    error.details = { field: 'reason' };
    return error;
};

// 몸에 정한 칸만 있는지 (모르는 칸이면 그 이름으로 400)
const readBody = (body, allowed) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !allowed.includes(key));
    if (unknown) throw invalid(unknown);
    return body;
};

const readUuid = (params) => {
    const uuid = params?.uuid;
    if (typeof uuid !== 'string' || !UUID_PATTERN.test(uuid)) throw invalid('uuid');
    return uuid.toLowerCase();
};

// 사유: 앞뒤 공백 빼고 1~200자 (예: '  보상  ' → '보상', '   ' → 400 REASON_REQUIRED)
const readReason = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length < 1 || text.length > REASON_MAX) throw reasonRequired();
    return text;
};

// GET /admin-api/members/:uuid/wallet → { ok, gold, diamond, ledger }
exports.get = async (req, res) => {
    const uuid = readUuid(req.params);
    res.json({ ok: true, ...(await wallet.getWallet({ uuid })) });
};

// POST /admin-api/members/:uuid/wallet/adjust { requestId, currency, amount, reason } → { ok, ledgerEntry, balance }
exports.adjust = async (req, res) => {
    const uuid = readUuid(req.params);
    const body = readBody(req.body, ['requestId', 'currency', 'amount', 'reason']);
    if (typeof body.requestId !== 'string' || !UUID_PATTERN.test(body.requestId)) throw invalid('requestId');
    if (!CURRENCIES.includes(body.currency)) throw invalid('currency');
    const { amount } = body;
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_BALANCE) throw invalid('amount');
    const reason = readReason(body.reason);
    const result = await wallet.adjustWallet({
        req, uuid, requestId: body.requestId.toLowerCase(), currency: body.currency, amount, reason,
    });
    res.json({ ok: true, ...result });
};
