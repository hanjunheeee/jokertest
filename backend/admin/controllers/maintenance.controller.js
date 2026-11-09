'use strict';

// 관리자 점검 경로 처리 파일, 요청 모양 검사 한 번 → 점검 서비스 → 응답
// maintenance.routes.js가 붙임 (GET 보기 · PUT 저장), 응답 모양은 경계.md 2-2
const { createError } = require('../../utils/appError');
const update = require('../services/maintenance/update');

const MESSAGE_MAX = 500;
const ALLOWED = ['enabled', 'message', 'startsAt', 'endsAt'];

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// ISO 시각 글자 또는 null → Date 또는 null (그 밖은 그 칸 이름으로 400)
const readTime = (value, field) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw invalid(field);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw invalid(field);
    return date;
};

// 몸 검사: 모르는 칸 거절, 켤 때 시작 시각 필수, 끝 안내가 시작보다 앞이면 거절
const readBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !ALLOWED.includes(key));
    if (unknown) throw invalid(unknown);
    if (typeof body.enabled !== 'boolean') throw invalid('enabled');
    const message = body.message ?? null;
    if (message !== null && (typeof message !== 'string' || message.trim().length > MESSAGE_MAX)) throw invalid('message');
    const startsAt = readTime(body.startsAt, 'startsAt');
    const endsAt = readTime(body.endsAt, 'endsAt');
    if (body.enabled && !startsAt) throw invalid('startsAt');
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) throw invalid('endsAt');
    return { enabled: body.enabled, message: message === null ? null : message.trim(), startsAt, endsAt };
};

// GET /admin-api/maintenance → { ok, maintenance, liveGames, liveRooms, liveNodes, livePartial, forceEnds }
exports.get = async (req, res) => {
    res.json({ ok: true, ...(await update.getMaintenance()) });
};

// PUT /admin-api/maintenance { enabled, message, startsAt, endsAt } → { ok, maintenance, nodes, partial }
exports.put = async (req, res) => {
    const input = readBody(req.body);
    res.json({ ok: true, ...(await update.updateMaintenance({ req, ...input })) });
};
