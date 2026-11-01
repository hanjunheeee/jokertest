'use strict';

// 장착 저장소 파일, 장착 행 보장 · 빈 칸 채우기 · 읽기 · 잠가 읽기 · 저장 · 여러 명 읽기
// 기본 지급·장착·지갑 요약 서비스가 economyModels(db)를 넘겨 부름

// 장착 행 없으면 만듦 (revision은 서비스가 만들어 넘김, 트랜잭션 주면 그 안에서)
const ensureLoadout = (models, { userId, revision }, transaction = null) => models.EconomyLoadout.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId, revision },
    ...(transaction ? { transaction } : {}),
});

// 그 칸이 비어 있을 때만 기본값 넣기 (사용자가 고른 장착은 안 덮음)
const fillEmptyColumn = (models, { userId, column, value, revision }, transaction = null) => models.EconomyLoadout.update(
    { [column]: value, revision },
    { where: { user_id: userId, [column]: null }, ...(transaction ? { transaction } : {}) },
);

// 장착 행 읽기 (트랜잭션 주면 그 안에서)
const findLoadout = (models, userId, transaction = null) => models.EconomyLoadout.findOne({ where: { user_id: userId }, ...(transaction ? { transaction } : {}) });

// 트랜잭션 안에서 장착 행 잠가 읽기 (revision 비교 뒤 바꾸는 사이 끼어들기 막기)
const lockLoadout = (models, userId, transaction) => models.EconomyLoadout.findOne({
    where: { user_id: userId },
    transaction,
    lock: transaction.LOCK.UPDATE,
});

// 읽어 둔 장착 행 바꾸기
const saveLoadout = (loadout, patch, transaction) => loadout.update(patch, { transaction });

// 여러 사람 장착 행 (남에게 보이는 프로필 장착·게임 시작 장착)
const listLoadouts = (models, userIds) => models.EconomyLoadout.findAll({ where: { user_id: userIds } });

module.exports = {
    ensureLoadout,
    fillEmptyColumn,
    findLoadout,
    lockLoadout,
    saveLoadout,
    listLoadouts,
};
