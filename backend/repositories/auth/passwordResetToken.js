'use strict';

// 비밀번호 재설정 토큰 저장소 파일, 안 쓴 토큰 폐기 · 만들기 · 해시로 찾기 · 쓴 표시
// 비밀번호 재설정 서비스(request·confirm)가 부름, 토큰 해시가 로그에 안 남게 쿼리 로그 전부 끔
const db = require('../../models');

// 그 사람의 안 쓴·안 폐기된 토큰 전부 폐기 (새 메일 보낼 때·재설정 끝날 때)
const revokeOpenTokens = (userId, transaction) => db.PasswordResetToken.update(
    { used: true, revoked_at: new Date() },
    { where: { user_id: userId, used: false, revoked_at: null }, transaction, logging: false },
);

// 토큰 한 줄 만들기 (해시만 넘어옴)
const createToken = (row, transaction) => db.PasswordResetToken.create(row, { transaction, logging: false });

// 토큰 해시로 하나 (새 비번 받기 전 링크 확인용이라 잠금 없음)
const findByHash = (tokenHash) => db.PasswordResetToken.findOne({
    where: { token_hash: tokenHash },
    logging: false,
});

// 트랜잭션 안에서 토큰 해시로 잠가 읽기 (같은 링크로 동시에 두 번 바꾸기 막기)
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
