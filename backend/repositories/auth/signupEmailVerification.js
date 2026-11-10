'use strict';

// 가입 이메일 인증 저장소 파일, 인증 행 잠가 읽기 · 만들기 · 바꾸기
// 가입 이메일 인증 서비스(request·verify)가 트랜잭션을 넘겨 부름, 해시·주소가 로그에 안 남게 쿼리 로그 끔
const db = require('../../models');

// 이메일·목적 인증 행 잠가 읽기 (같은 주소로 동시에 보내기·확인하기를 한 줄로 세움)
const lockByEmail = ({ email, purpose }, transaction) => db.SignupEmailVerification.findOne({
    where: { email, purpose },
    transaction, lock: transaction.LOCK.UPDATE, logging: false,
});

// 인증 행 한 줄 만들기 (그 주소로 처음 보낼 때)
const createVerification = (row, transaction) => db.SignupEmailVerification.create(row, { transaction, logging: false });

// 이메일·목적 인증 행 없으면 만들고 있으면 그대로 둠 (가입 인증번호 보내기가 잠가 읽기 전에 부름)
// 없는 행을 잠가 읽으면 빈 틈 잠금만 걸려 같은 주소 요청끼리 서로 넣기를 막아 교착 → 겹치면 바꾸기로 처음부터 그 행 하나를 혼자 쥐고 줄 세움
// 바꾸는 칸은 email 그대로라 이미 있는 행 값은 안 바뀜
const ensureVerificationRow = ({ email, purpose }, transaction) => db.SignupEmailVerification.create(
    { email, purpose, generation: 0, attempts: 0 },
    { transaction, logging: false, updateOnDuplicate: ['email'] },
);

// 인증 행 id로 바꾸기 (다시 보내기·틀린 횟수·증명 발급·증명 사용)
const updateVerification = (id, patch, transaction) => db.SignupEmailVerification.update(
    patch,
    { where: { id }, transaction, logging: false },
);

module.exports = {
    lockByEmail,
    createVerification,
    ensureVerificationRow,
    updateVerification,
};
