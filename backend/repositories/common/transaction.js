'use strict';

// 트랜잭션 파일, 서비스가 sequelize를 몰라도 트랜잭션 묶음을 열게 함
// 부를 때마다 db.sequelize.transaction을 찾음 (시험이 이 함수를 갈아끼워도 먹게)

// 트랜잭션 열기: (db, work) 또는 (db, options, work), 받은 모양 그대로 sequelize에 넘김
const withTransaction = (db, ...args) => db.sequelize.transaction(...args);

module.exports = {
    withTransaction,
};
