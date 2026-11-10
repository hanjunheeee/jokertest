'use strict';

// 지갑 저장소 파일, 빈 지갑 만들기 · 잠가 읽기 · 읽기 · 잔액 저장
// 장부 거래·구매·골드 구매·지갑 요약 서비스가 economyModels(db)를 넘겨 부름

// 잔액 0 지갑 한 줄 (바깥 트랜잭션 주면 그 안에서), 이미 있으면 아무것도 안 바꿈
// 그냥 넣기는 겹칠 때 나눠 쓰는 잠금을 쥔 채 남아 뒤 잠가 읽기에서 같은 사람 요청끼리 서로 막힘(데드락)
// → 겹치면 바꾸기(ON DUPLICATE KEY UPDATE)로 처음부터 혼자 쓰는 잠금을 잡아 차례로 섬 (값은 user_id 그대로라 잔액 안 건드림)
const createEmptyWallet = (models, userId, transaction = null) => models.EconomyWallet.create(
    { user_id: userId, balance_gold: 0, balance_diamond: 0 },
    { ...(transaction ? { transaction } : {}), updateOnDuplicate: ['user_id'] },
);

// 트랜잭션 안에서 지갑 잠가 읽기 (같은 사람 잔액 바꾸기를 한 줄로 세움)
const lockWallet = (models, userId, transaction) => models.EconomyWallet.findOne({
    where: { user_id: userId },
    transaction,
    lock: transaction.LOCK.UPDATE,
});

// 지갑 읽기 (잠금 없이, 요약 화면용)
const findWallet = (models, userId) => models.EconomyWallet.findOne({ where: { user_id: userId } });

// 읽어 둔 지갑 행 바꾸기
const saveWallet = (wallet, patch, transaction) => wallet.update(patch, { transaction });

module.exports = {
    createEmptyWallet,
    lockWallet,
    findWallet,
    saveWallet,
};
