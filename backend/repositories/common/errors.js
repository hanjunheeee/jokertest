'use strict';

// DB 오류 판정 파일, 유일 제약 위반인지 · 데드락인지
// common/index.js가 다시 내보냄, 서비스가 Sequelize 오류 이름·MySQL 코드를 몰라도 되게 함

// Sequelize 유일 제약 위반인지 (오류 이름으로)
const isUniqueConstraintName = (error) => error?.name === 'SequelizeUniqueConstraintError';

// 골드 구매 다시 시도용 데드락 판정 (MySQL 코드만 봄)
const isDeadlockError = (error) =>
    error?.parent?.code === 'ER_LOCK_DEADLOCK' || error?.original?.code === 'ER_LOCK_DEADLOCK';

// 비번 재설정 다시 시도용 데드락 판정 (Sequelize 데드락 이름까지 봄, 위와 갈린 건 옮기기 전 그대로 둠)
const isDeadlock = (error) => (
    error?.name === 'SequelizeDeadlockError'
    || error?.original?.code === 'ER_LOCK_DEADLOCK'
    || error?.parent?.code === 'ER_LOCK_DEADLOCK'
);

module.exports = {
    isUniqueConstraintName,
    isDeadlockError,
    isDeadlock,
};
