'use strict';

// 판 설정 값 경로 처리 파일, 요청 모양 검사 한 번 → 판 설정 값 서비스 → 응답
// gameSettings.routes.js가 붙임 (GET 보기 · PUT 바꾸기), 판 골드는 0~100 정수만
const { createError } = require('../../utils/appError');
const manage = require('../services/gameSettings/manage');

const invalid = (field) => {
    const error = createError('입력한 값을 다시 확인해 주세요.', 400, 'INVALID_INPUT');
    error.details = { field };
    return error;
};

// 몸에 정한 칸만 있는지 (모르는 칸이면 그 이름으로 400)
const readBody = (body, allowed) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body');
    const unknown = Object.keys(body).find((key) => !allowed.includes(key));
    if (unknown) throw invalid(unknown);
    return body;
};

// GET /admin-api/game-settings → { ok, settings:{ goldReward, updatedAt, updatedBy }, limits:{ goldReward:{ min, max } }, node }
exports.get = async (req, res) => {
    res.json({ ok: true, ...(await manage.getGameSettings()) });
};

// PUT /admin-api/game-settings { goldReward } → { ok, settings, limits, nodes, partial }
// 글자·소수·음수·100 넘는 값은 400 (숫자 글자 '2'도 안 받음, 화면이 수로 보냄)
exports.update = async (req, res) => {
    const { goldReward } = readBody(req.body, ['goldReward']);
    if (!manage.isValidGoldReward(goldReward)) throw invalid('goldReward');
    res.json({ ok: true, ...(await manage.updateGameSettings({ req, goldReward })) });
};
