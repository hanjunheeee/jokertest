'use strict';

// DB 오류 판정 파일, 유일 제약 위반 · 데드락인지
// 서비스가 Sequelize 오류 이름·MySQL 코드를 직접 몰라도 되게 (판정 내용은 옮기기 전 그대로)

// Sequelize 유일 제약 위반 오류인지 (이름으로)
const isUniqueConstraintName = (error) => error?.name === 'SequelizeUniqueConstraintError';

// MySQL 데드락인지 (경제 골드 구매 쪽 판정: 원본·부모 오류 코드)
const isDeadlockError = (error) =>
    error?.parent?.code === 'ER_LOCK_DEADLOCK' || error?.original?.code === 'ER_LOCK_DEADLOCK';

// 데드락인지 (비번 재설정 쪽 판정: Sequelize 데드락 이름까지 같이 봄)
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
