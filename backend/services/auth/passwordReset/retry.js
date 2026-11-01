'use strict';

// 비밀번호 재설정 재시도 파일, 데드락 판정 · 트랜잭션 다시
// 같은 폴더 request.js·confirm.js가 씀, testing.js는 판정만 다시 내보냄
const userRepository = require('../../../repositories/user');
const { DEADLOCK_MAX_RETRIES } = require('./constants');
// 데드락 판정은 공통 저장소 (Sequelize 데드락 이름·MySQL 코드 둘 다 봄)
const { isDeadlock } = require('../../../repositories/common');

// 데드락이면 정해진 횟수까지 트랜잭션 처음부터 다시 (DB가 한쪽을 되돌렸으므로)
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
