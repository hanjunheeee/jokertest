'use strict';

// 보유 아이템 저장소 파일, 하나 찾기 · 여러 개 중 가진 것 · 만들기 · 전체 목록 · 종류별 목록(한 명·여러 명)
// 장부 거래·장착·지갑 요약·팔레트 서비스가 economyModels(db)를 넘겨 부름

// 그 아이템 보유 행 (트랜잭션 주면 그 안에서)
const findOwned = (models, { userId, itemId }, transaction = null) => models.EconomyEntitlement.findOne({
    where: { user_id: userId, item_id: itemId },
    ...(transaction ? { transaction } : {}),
});

// 아이템 여러 개 중 가진 것만 한 번에 (트랜잭션 주면 그 안에서)
const findOwnedAmong = (models, { userId, itemIds }, transaction = null) => models.EconomyEntitlement.findAll({
    where: { user_id: userId, item_id: itemIds },
    ...(transaction ? { transaction } : {}),
});

// 보유 한 줄 만들기 (장부 쓰기와 같은 트랜잭션)
const createOwned = (models, row, transaction) => models.EconomyEntitlement.create(row, { transaction });

// 그 사람 보유 전부, 얻은 순
const listOwned = (models, userId) => models.EconomyEntitlement.findAll({ where: { user_id: userId }, order: [['id', 'ASC']] });

// 그 사람 보유 중 한 종류만 (팔레트가 가진 이모티콘 고를 때, 트랜잭션 주면 그 안에서)
const listOwnedByType = (models, { userId, itemType }, transaction = null) => models.EconomyEntitlement.findAll({
    where: { user_id: userId, item_type: itemType },
    ...(transaction ? { transaction } : {}),
});

// 여러 사람 보유 중 한 종류만 한 번에 (판 시작 때 참가자 이모티콘 같이 읽기)
const listOwnedByTypeAmong = (models, { userIds, itemType }) => models.EconomyEntitlement.findAll({
    where: { user_id: userIds, item_type: itemType },
});

module.exports = {
    findOwned,
    findOwnedAmong,
    createOwned,
    listOwned,
    listOwnedByType,
    listOwnedByTypeAmong,
};
