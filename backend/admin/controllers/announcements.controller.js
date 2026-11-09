'use strict';

// 관리자 공지 경로 처리 파일, 요청 모양 검사 한 번 → 공지 보내기 서비스 → 발송 결과 응답
// announcements.routes.js가 붙임 (POST /admin-api/announcements), 응답 모양은 경계.md 1-3
const { createError } = require('../../utils/appError');
const { sendAdminAnnouncement } = require('../services/announcements/send');

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TITLE_MAX = 120;
const BODY_MAX = 500;
const TARGETS_MAX = 5000;
const FIELDS = ['requestId', 'title', 'body', 'target', 'userUuids'];

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);
// 앞뒤 빈칸 뺀 길이가 1~max인 글자면 뺀 글자, 아니면 null
const trimmedText = (value, max) => {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length >= 1 && text.length <= max ? text : null;
};

// 몸 검사: 모르는 칸·빠진 칸·모양 틀림 → 400 { field }
const readBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !FIELDS.includes(key));
    if (unknown) throw invalid(unknown);
    if (!isUuid(body.requestId)) throw invalid('requestId');
    const title = trimmedText(body.title, TITLE_MAX);
    if (!title) throw invalid('title');
    const text = trimmedText(body.body, BODY_MAX);
    if (!text) throw invalid('body');
    if (body.target === 'online') {
        if (body.userUuids !== undefined) throw invalid('userUuids');
        return { requestId: body.requestId, title, body: text, target: 'online', userUuids: undefined };
    }
    if (body.target !== 'users') throw invalid('target');
    const { userUuids } = body;
    if (!Array.isArray(userUuids) || userUuids.length < 1 || userUuids.length > TARGETS_MAX || !userUuids.every(isUuid)) {
        throw invalid('userUuids');
    }
    return { requestId: body.requestId, title, body: text, target: 'users', userUuids };
};

// POST /admin-api/announcements → { ok, result, auditId }
exports.send = async (req, res) => {
    const input = readBody(req.body);
    const { result, auditId } = await sendAdminAnnouncement({ req, ...input });
    res.json({ ok: true, result, auditId });
};

exports.readBody = readBody;
