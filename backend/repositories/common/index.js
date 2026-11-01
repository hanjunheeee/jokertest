'use strict';

// 공통 저장소 파일, 트랜잭션 열기 + DB 오류 판정(errors.js) 모아서 내보냄
// 업적·인증·경제·친구·알림 서비스가 부름, 서비스가 sequelize를 몰라도 트랜잭션을 열게 함
const { isUniqueConstraintName, isDeadlockError, isDeadlock } = require('./errors');

// 트랜잭션 열기: (db, work) 또는 (db, options, work)를 받은 모양 그대로 넘김
// 부를 때마다 db.sequelize.transaction을 찾음 (시험이 그 함수를 바꿔 끼워도 먹게)
const withTransaction = (db, ...args) => db.sequelize.transaction(...args);

module.exports = {
    withTransaction,
    isUniqueConstraintName,
    isDeadlockError,
    isDeadlock,
};
