'use strict';

// 공통 저장소 파일, 트랜잭션 열기(여기) · DB 오류 판정(errors.js) 모아서 내보냄
// 카테고리 저장소·서비스가 이 파일로 부름, 서비스가 sequelize를 몰라도 트랜잭션 묶음을 열게 함
const { isUniqueConstraintName, isDeadlockError, isDeadlock } = require('./errors');

// 트랜잭션 열기: (db, work) 또는 (db, options, work), 받은 모양 그대로 sequelize에 넘김
// 부를 때마다 db.sequelize.transaction을 찾음 (시험이 이 함수를 갈아끼워도 먹게)
const withTransaction = (db, ...args) => db.sequelize.transaction(...args);

module.exports = {
    withTransaction,
    isUniqueConstraintName,
    isDeadlockError,
    isDeadlock,
};
