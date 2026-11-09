'use strict';

// 제재 경로 처리 파일, 요청 모양 검사 한 번(사유 필수·모르는 칸 거절) → 정지·기간 바꾸기·해제·강제 접속 종료 서비스
// sanctions.routes.js가 붙임 (/admin-api/members/:uuid 아래), 응답 모양은 경계.md 1-2
const { createError } = require('../../utils/appError');
const { banAndDisconnect, updateBan } = require('../services/sanctions/ban');
const { unbanMember } = require('../services/sanctions/unban');
const { forceDisconnectMember } = require('../services/sanctions/forceDisconnect');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const REASON_MAX = 200;
const DAYS_MAX = 3650;
const KINDS = new Set(['PERIOD', 'PERMANENT']);

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

// 몸이 객체인지 + 모르는 칸 거절 (예: { reason, extra } → 400 { field:'extra' }), 몸 없음은 빈 객체로 (사유 빔 → REASON_REQUIRED)
const readBody = (rawBody, allowed) => {
    const body = rawBody ?? {};
    if (typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !allowed.includes(key));
    if (unknown) throw invalid(unknown);
    return body;
};

// 사유 1~200자 (비면 400 REASON_REQUIRED, 길면 INVALID_INPUT)
const readReason = (value) => {
    const reason = typeof value === 'string' ? value.trim() : '';
    if (!reason) {
        const error = createError('사유를 적어 주세요.', 400, 'REASON_REQUIRED');
        error.details = { field: 'reason' };
        throw error;
    }
    if (reason.length > REASON_MAX) throw invalid('reason', `사유는 ${REASON_MAX}자까지 적을 수 있어요.`);
    return reason;
};

// 정지 종류: 기간(days 1~3650 정수) 또는 영구(days 없음)
const readPeriod = (body) => {
    if (!KINDS.has(body.kind)) throw invalid('kind');
    if (body.kind === 'PERMANENT') {
        if (body.days !== undefined && body.days !== null) throw invalid('days');
        return { kind: 'PERMANENT', days: null };
    }
    if (!Number.isInteger(body.days) || body.days < 1 || body.days > DAYS_MAX) {
        throw invalid('days', `정지 기간은 1~${DAYS_MAX}일로 넣어 주세요.`);
    }
    return { kind: 'PERIOD', days: body.days };
};

// 사유를 먼저 봄 (사유 빔이 다른 칸보다 먼저 알려지게)
const readBanInput = (rawBody) => {
    const body = readBody(rawBody, ['kind', 'days', 'reason']);
    const reason = readReason(body.reason);
    return { ...readPeriod(body), reason };
};

// POST /:uuid/force-disconnect { reason } → { disconnected, partial }
exports.forceDisconnect = async (req, res) => {
    const uuid = readUuid(req.params);
    const { reason } = readBody(req.body, ['reason']);
    const outcome = await forceDisconnectMember({ req, uuid, reason: readReason(reason) });
    res.json({ ok: true, ...outcome });
};

// POST /:uuid/bans { kind, days?, reason } → 201 { ban, disconnect }
exports.ban = async (req, res) => {
    const uuid = readUuid(req.params);
    const input = readBanInput(req.body);
    const made = await banAndDisconnect({ req, uuid, ...input });
    res.status(201).json({ ok: true, ...made });
};

// PATCH /:uuid/bans/:banId { kind, days?, reason } → { ban }
exports.updateBan = async (req, res) => {
    const uuid = readUuid(req.params);
    const banId = Number(req.params.banId);
    if (!Number.isInteger(banId) || banId < 1) throw createError('그런 정지 기록이 없어요.', 404, 'BAN_NOT_FOUND');
    const input = readBanInput(req.body);
    const changed = await updateBan({ req, uuid, banId, ...input });
    res.json({ ok: true, ...changed });
};

// POST /:uuid/unban { reason } → { liftedCount }
exports.unban = async (req, res) => {
    const uuid = readUuid(req.params);
    const { reason } = readBody(req.body, ['reason']);
    const lifted = await unbanMember({ req, uuid, reason: readReason(reason) });
    res.json({ ok: true, ...lifted });
};
