'use strict';

// 계정 조회 저장소 파일, 계정 잠가 읽기 · 닉네임 하나 · 전체 uuid · 아이디 찾기용 계정
// 초대·친구 요청·업적 다시 평가·아이디 찾기 서비스가 db를 넘겨 부름 (주입 db·전역 db 둘 다)

// 트랜잭션 안에서 계정 행 잠가 읽기 (uuid·닉네임·상태)
const lockAccount = (db, uuid, transaction) => db.User.findOne({
    where: { uuid },
    attributes: ['uuid', 'nickname', 'status'],
    transaction,
    lock: transaction.LOCK.UPDATE,
});

// 닉네임만 읽기 (트랜잭션 그대로 넘김)
const findNickname = (db, uuid, transaction) => db.User.findOne({
    where: { uuid }, attributes: ['nickname'], transaction,
});

// 모든 계정 uuid (plain 행)
const listAllUuids = (db) => db.User.findAll({ attributes: ['uuid'], raw: true });

// 아이디 찾기용: 닉네임으로 닉네임·이메일·생일 (plain 행, 쿼리 로그 안 남김)
const findForFindId = (db, nickname) => db.User.findOne({
    where: { nickname },
    attributes: ['nickname', 'email', 'birth_date'],
    raw: true,
    logging: false,
});

module.exports = {
    lockAccount,
    findNickname,
    listAllUuids,
    findForFindId,
};
