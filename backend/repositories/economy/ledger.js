'use strict';

// 장부 저장소 파일, 참조 id로 찾기 · 한 줄 만들기 · 최근 목록
// 장부 거래·거래 목록이 economyModels(db) 묶음을 넘겨 부름

// 같은 사람·같은 참조 id 장부 행 (트랜잭션 주면 그 안에서)
const findByReference = (models, { userId, referenceEventId }, transaction = null) => models.EconomyLedgerEntry.findOne({
    where: { user_id: userId, reference_event_id: referenceEventId },
    ...(transaction ? { transaction } : {}),
});

// 장부 한 줄 만들기
const createEntry = (models, row, transaction) => models.EconomyLedgerEntry.create(row, { transaction });

// 그 사람 장부 최근 것부터 limit개
const listEntries = (models, userId, limit) => models.EconomyLedgerEntry.findAll({
    where: { user_id: userId },
    order: [['id', 'DESC']],
    limit,
});

module.exports = {
    findByReference,
    createEntry,
    listEntries,
};
