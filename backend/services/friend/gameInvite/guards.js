'use strict';

// 게임 초대 확인 파일, 받는 계정 잠금 · 차단 확인 · 지난 초대 만료 정리
// create·cancel·entry·queries가 트랜잭션 안에서 부름
const blockRepository = require('../../../repositories/friend/block');
const { INVITE_STATUS } = require('./constants');
const userLookup = require('../../../repositories/user/lookup');
const gameInviteRepository = require('../../../repositories/friend/gameInvite');

// 받는 계정 행 잠금 (그 사람 초대 바꾸는 일 한 줄로 세우기)
const lockReceiver = async (db, receiverId, transaction) => {
    return await userLookup.lockAccount(db, receiverId, transaction);
};

// 둘 중 누가 차단했으면 참 (거절 문구는 부르는 쪽이 정함)
const isBlockedBetween = async (uuidA, uuidB, options = {}) => {
    const blocks = await blockRepository.findBlocksBetween(uuidA, uuidB, options);
    return blocks.length > 0;
};

// 받는 사람의 시간 지난 대기 초대 만료 처리 → 바뀐 수 (읽기·바꾸기 전에 먼저 정리)
const expireDueInvites = async (db, receiverId, now, transaction) => {
    const [affected] = await gameInviteRepository.expireDue(db, {
        receiverId, now, expiredStatus: INVITE_STATUS.EXPIRED, pendingStatus: INVITE_STATUS.PENDING,
    }, transaction);
    return affected ?? 0;
};

module.exports = {
    lockReceiver,
    isBlockedBetween,
    expireDueInvites,
};
