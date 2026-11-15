'use strict';

// 판 설정 값 저장소 파일, game_settings 표 전부 읽기 · 한 줄 잠가 읽기 · 넣기 · 고치기
// services/ops/gameSettings.js(서버 켤 때·다시 읽기)·admin/services/gameSettings/manage.js(관리자 보기·바꾸기)가 부름

// 값 줄 전부 (몇 줄 안 됨, 다시 읽기 한 번에 질의 하나)
const findAllSettings = (db, transaction = null) => db.GameSetting.findAll({
    attributes: ['key', 'value_int', 'updated_at', 'updated_by'],
    ...(transaction ? { transaction } : {}),
});

// 트랜잭션 안에서 한 줄 잠가 읽기 (관리자 둘이 동시에 바꿔도 앞뒤 기록이 엇갈리지 않게)
const lockSetting = (db, key, transaction) => db.GameSetting.findOne({
    where: { key },
    transaction,
    lock: transaction.LOCK.UPDATE,
});

// 줄 없을 때 새로 넣기
const createSetting = (db, row, transaction) => db.GameSetting.create(row, { transaction });

// 있는 줄 고치기
const saveSetting = (row, changes, transaction) => row.update(changes, { transaction });

module.exports = {
    findAllSettings,
    lockSetting,
    createSetting,
    saveSetting,
};
