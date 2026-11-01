'use strict';

// 이모티콘 팔레트 처리기 파일, 내 팔레트 읽기 · 저장 (오류는 이 파일 응답 모양으로 바로 보냄)
// routes/user.routes.js가 /me/emoji-palette에 부름 (경제 서비스는 모듈 객체로)
const economyService = require('../../services/economy');

const ALLOWED_SAVE_FIELDS = new Set(['slots', 'expectedRevision']);

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
