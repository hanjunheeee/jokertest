'use strict';

// 계정 조회 저장소 파일, 계정 잠가 읽기 · 닉네임 하나 · 전체 uuid · 아이디 찾기용 계정 · 순위 표 프로필
// 초대·친구 신청·업적 다시 평가·아이디 찾기·직업 통계 서비스가 db를 넘겨 바로 부름

// 트랜잭션 안에서 계정 행 잠가 읽기 (같은 사람 초대 바꾸는 일을 한 줄로 세움)
const lockAccount = (db, uuid, transaction) => db.User.findOne({
    where: { uuid },
    attributes: ['uuid', 'nickname', 'status'],
    transaction,
    lock: transaction.LOCK.UPDATE,
});

// 닉네임만 읽기 (알림 문구용, 트랜잭션 그대로 넘김)
const findNickname = (db, uuid, transaction) => db.User.findOne({
    where: { uuid }, attributes: ['nickname'], transaction,
});

// 모든 계정 uuid (업적 다시 평가 대상)
const listAllUuids = (db) => db.User.findAll({ attributes: ['uuid'], raw: true });

// 아이디 찾기용: 닉네임으로 닉네임·이메일·생일 (이메일이 로그에 안 남게 쿼리 로그 끔)
const findForFindId = (db, nickname) => db.User.findOne({
    where: { nickname },
    attributes: ['nickname', 'email', 'birth_date'],
    raw: true,
    logging: false,
});

// 순위 표용: uuid 여러 개의 닉네임·사진
const findRankingProfiles = (db, uuids) => db.User.findAll({
    where: { uuid: uuids },
    attributes: ['uuid', 'nickname', 'profile_image_url'],
    raw: true,
});

module.exports = {
    lockAccount,
    findNickname,
    listAllUuids,
    findForFindId,
    findRankingProfiles,
};
