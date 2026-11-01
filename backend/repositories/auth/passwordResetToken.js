'use strict';

// 비밀번호 재설정 토큰 저장소 파일, 안 쓴 토큰 폐기 · 만들기 · 해시로 찾기 · 쓴 표시
// 비밀번호 재설정 서비스가 부름 (쿼리 로그는 남기지 않음)
const db = require('../../models');

// 그 사람의 안 쓴·안 폐기된 토큰 전부 폐기 (폐기 시각은 지금)
const revokeOpenTokens = (userId, transaction) => db.PasswordResetToken.update(
    { used: true, revoked_at: new Date() },
    { where: { user_id: userId, used: false, revoked_at: null }, transaction, logging: false },
);

// 토큰 한 줄 만들기
const createToken = (row, transaction) => db.PasswordResetToken.create(row, { transaction, logging: false });

// 토큰 해시로 하나 (잠금 없이)
const findByHash = (tokenHash) => db.PasswordResetToken.findOne({
    where: { token_hash: tokenHash },
    logging: false,
});

// 트랜잭션 안에서 토큰 해시로 잠가 읽기
const lockByHash = (tokenHash, transaction) => db.PasswordResetToken.findOne({
    where: { token_hash: tokenHash },
    transaction, lock: transaction.LOCK.UPDATE, logging: false,
});

// 토큰 하나 쓴 표시
const markUsed = (id, transaction) => db.PasswordResetToken.update(
    { used: true },
    { where: { id }, transaction, logging: false },
);

module.exports = {
    revokeOpenTokens,
    createToken,
    findByHash,
    lockByHash,
    markUsed,
};
