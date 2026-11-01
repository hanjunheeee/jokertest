'use strict';

// 가입 이메일 인증 저장소 파일, 인증 행 잠가 읽기 · 만들기 · 바꾸기
// 가입 이메일 인증 서비스가 트랜잭션을 넘겨 부름 (쿼리 로그는 남기지 않음)
const db = require('../../models');

// 이메일·목적 인증 행 잠가 읽기
const lockByEmail = ({ email, purpose }, transaction) => db.SignupEmailVerification.findOne({
    where: { email, purpose },
    transaction, lock: transaction.LOCK.UPDATE, logging: false,
});

// 인증 행 한 줄 만들기
const createVerification = (row, transaction) => db.SignupEmailVerification.create(row, { transaction, logging: false });

// 인증 행 id로 바꾸기
const updateVerification = (id, patch, transaction) => db.SignupEmailVerification.update(
    patch,
    { where: { id }, transaction, logging: false },
);

module.exports = {
    lockByEmail,
    createVerification,
    updateVerification,
};
