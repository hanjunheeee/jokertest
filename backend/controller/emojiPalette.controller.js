'use strict';

// F-33 E-2(설계도 §2-2): GET/PUT /user/me/emoji-palette. 대상 계정은 언제나 verifyToken이
// 채운 req.user.uuid 하나뿐이다 — 본문·쿼리로 다른 userId를 지정할 방법을 두지 않는다(AC-07).
//
// 서비스는 구조 분해로 캡처하지 않고 모듈 객체로 호출한다(economy.routes.js와 같은 관례) —
// 라우트 시험이 서비스 함수를 일시적으로 바꿔 끼워도 이 파일에 반영된다.
const economyService = require('../service/economy.service');

// 로드아웃(economy.routes.js ALLOWED_EQUIP_PROFILE_FIELDS)과 같은 규칙: 모르는 필드는
// 조용히 무시하지 않고 즉시 400으로 거부한다("무시는 거부가 아니다", AC-06).
const ALLOWED_SAVE_FIELDS = new Set(['slots', 'expectedRevision']);

/** AppError(backend/utils/appError.js)는 숫자 status와 문자열 code를 별도 필드로 갖는다 —
 *  status는 HTTP 상태로, code는 응답 본문의 분기 값으로 각각 쓴다. REVISION_MISMATCH만
 *  에러 객체에 현재 revision·slots를 함께 달고 오므로 그때만 본문에 실어 보낸다(AC-03). */
const respondWithError = (res, error) => {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const body = {
        ok: false,
        code: error?.code ?? 'EMOJI_PALETTE_ERROR',
        message: error?.message ?? '이모티콘 팔레트 처리 중 오류가 발생했습니다.',
    };
    if (error?.revision !== undefined) {
        body.revision = error.revision;
        body.slots = error.slots;
    }
    res.status(status).json(body);
};

exports.getEmojiPalette = async (req, res) => {
    try {
        const { slots, revision, owned } = await economyService.getEmojiPalette(req.user.uuid);
        res.json({ ok: true, slots, revision, owned });
    } catch (error) {
        respondWithError(res, error);
    }
};

exports.saveEmojiPalette = async (req, res) => {
    try {
        const body = req.body ?? {};
        const unknown = Object.keys(body).filter((key) => !ALLOWED_SAVE_FIELDS.has(key));
        if (unknown.length > 0) {
            return res.status(400).json({
                ok: false,
                code: 'INVALID_FIELDS',
                message: '허용되지 않은 필드가 포함되어 있습니다.',
            });
        }

        const { slots, expectedRevision } = body;
        const saved = await economyService.saveEmojiPalette(req.user.uuid, { slots, expectedRevision });
        res.json({ ok: true, slots: saved.slots, revision: saved.revision });
    } catch (error) {
        respondWithError(res, error);
    }
};
