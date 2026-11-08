'use strict';

// 신고 채팅 증거 정리 파일, 저장한 지 90일 지난 증거 줄을 지움 (신고 줄은 남김)
// 아직 예약 실행 안 붙임 (index.js에 안 넣음), 관리자 서버 작업이나 운영자가 하루 한 번 부르면 됨
const { Op } = require('sequelize');

const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const defaultDb = () => require('../../repositories/common/db');

// 기준 시각보다 오래된 증거 지우기, 지운 줄 수 돌려줌
const purgeExpiredChatEvidence = async ({ db = defaultDb(), now = () => new Date(), days = RETENTION_DAYS } = {}) => {
    if (!Number.isInteger(days) || days < 1) throw new Error('days는 1 이상의 정수여야 합니다.');
    const cutoff = new Date(now().getTime() - days * DAY_MS);
    const deleted = await db.ReportChatEvidence.destroy({ where: { saved_at: { [Op.lt]: cutoff } } });
    return { deleted, cutoff: cutoff.toISOString() };
};

module.exports = { RETENTION_DAYS, purgeExpiredChatEvidence };
