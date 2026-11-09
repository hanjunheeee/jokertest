'use strict';
const { Op } = require('sequelize');

// 장부 저장소 파일, 참조 id로 찾기(하나·여러 개) · 한 줄 만들기 · 최근 목록
// 장부 거래·거래 목록 서비스가 economyModels(db)를 넘겨 부름

// 같은 사람·같은 참조 id 장부 행 (이미 처리한 거래인지, 트랜잭션 주면 그 안에서)
const findByReference = (models, { userId, referenceEventId }, transaction = null) => models.EconomyLedgerEntry.findOne({
    where: { user_id: userId, reference_event_id: referenceEventId },
    ...(transaction ? { transaction } : {}),
});

// 같은 사람·참조 id 여러 개 장부 행 한 번에 (기본 지급 이미 했는지 한 번에 보려고, 트랜잭션 주면 그 안에서)
const findByReferences = (models, { userId, referenceEventIds }, transaction = null) => models.EconomyLedgerEntry.findAll({
    where: { user_id: userId, reference_event_id: referenceEventIds },
    ...(transaction ? { transaction } : {}),
});

// 장부 한 줄 만들기 (잔액 바꾸기와 같은 트랜잭션)
const createEntry = (models, row, transaction) => models.EconomyLedgerEntry.create(row, { transaction });

// 거래 내역에서 뺄 줄: 0골드 기본 지급 (가입 때 기본 아이템마다 한 줄씩 약 25줄, 돈이 안 움직여 내역만 채움, 2026-11-09)
// 장부엔 그대로 남김 (아이템 받은 기록·다시 안 주기 확인·장부 검증 시험이 씀), 이미 가입한 계정 내역도 같이 깨끗해짐
const HIDDEN_FROM_HISTORY = { reason: 'DEFAULT_GRANT', amount: 0 };

// 그 사람 장부 최근 것부터 limit개 (0골드 기본 지급 줄 빼고)
const listEntries = (models, userId, limit) => models.EconomyLedgerEntry.findAll({
    where: { user_id: userId, [Op.not]: HIDDEN_FROM_HISTORY },
    order: [['id', 'DESC']],
    limit,
});

module.exports = {
    findByReference,
    findByReferences,
    createEntry,
    listEntries,
    HIDDEN_FROM_HISTORY,
};
