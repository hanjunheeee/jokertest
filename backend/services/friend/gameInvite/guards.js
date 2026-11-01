'use strict';

// 게임 초대 확인 파일, 받는 계정 잠금 · 차단 확인 · 지난 초대 만료 정리
// 만들기가 트랜잭션 안에서 부름
const friendRepository = require('../../../repositories/friend.repositories');
const { INVITE_STATUS } = require('./constants');

// 받는 계정 행 잠금 (같은 사람에게 동시에 초대 두 개 막기)
const lockReceiver = async (db, receiverId, transaction) => {
    return await db.User.findOne({
        where: { uuid: receiverId },
        attributes: ['uuid', 'nickname', 'status'],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
};

// 둘 중 누가 차단했으면 참
const isBlockedBetween = async (uuidA, uuidB, options = {}) => {
    const blocks = await friendRepository.findBlocksBetween(uuidA, uuidB, options);
    return blocks.length > 0;
};

// 시간 지난 대기 초대를 만료로 바꾸고 바뀐 수
const expireDueInvitesForReceiver = async (db, receiverId, now, transaction) => {
    const [affected] = await db.GameInvite.update(
        {
            status: INVITE_STATUS.EXPIRED,
            end_reason: 'EXPIRED',
            decided_at: now,
            revision: db.sequelize.literal('revision + 1'),
        },
        {
            where: {
                receiver_id: receiverId,
                status: INVITE_STATUS.PENDING,
                expires_at: { [db.Sequelize.Op.lte]: now },
            },
            transaction,
        },
    );
    return affected ?? 0;
};

module.exports = {
    lockReceiver,
    isBlockedBetween,
    expireDueInvitesForReceiver,
};
