'use strict';

// 구매 요청 저장소 파일, 참조 id로 구매 요청 찾기 · 만들기
// 아이템·골드 구매 서비스가 economyModels(db)를 넘겨 부름 (같은 요청 두 번 처리 막기)

// 같은 사람·같은 참조 id 구매 요청 (있으면 저장한 결과를 그대로 돌려줌, 트랜잭션 주면 그 안에서)
const findRequestByReference = (models, { userId, referenceEventId }, transaction = null) => models.EconomyPurchaseRequest.findOne({
    where: { user_id: userId, reference_event_id: referenceEventId },
    ...(transaction ? { transaction } : {}),
});

// 구매 요청 한 줄 만들기 (요청 내용·결과까지 같이 저장)
const createRequest = (models, row, transaction) => models.EconomyPurchaseRequest.create(row, { transaction });

module.exports = {
    findRequestByReference,
    createRequest,
};
