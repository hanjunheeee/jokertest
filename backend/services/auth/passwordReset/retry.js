'use strict';

// 비밀번호 재설정 재시도 파일, 데드락 판정 · 트랜잭션 다시
// 요청·바꾸기가 같은 묶음으로 씀
const userRepository = require('../../../repositories/user.repositories');
const { DEADLOCK_MAX_RETRIES } = require('./constants');

// Sequelize 데드락 오류인지 (이름·코드 둘 다 봄)
const isDeadlock = (error) => (
    error?.name === 'SequelizeDeadlockError'
    || error?.original?.code === 'ER_LOCK_DEADLOCK'
    || error?.parent?.code === 'ER_LOCK_DEADLOCK'
);

// 데드락이면 정해진 횟수까지 트랜잭션 처음부터 다시
const withDeadlockRetry = async (work) => {
    let attempt = 0;
    for (;;) {
        try {
            return await userRepository.withTransaction(work, { logging: false });
        } catch (error) {
            attempt += 1;
            if (isDeadlock(error) && attempt <= DEADLOCK_MAX_RETRIES) continue;
            throw error;
        }
    }
};

module.exports = {
    isDeadlock,
    withDeadlockRetry,
};
