'use strict';

// 게임 초대 저장소 파일, 초대 행 찾기·만들기·잠그기·바꾸기 · 만료·취소 묶음
// 게임 초대 서비스가 주입 db를 넘겨 부름 (상태 값·시각은 서비스가 정해서 넘김)

// 그 받는 사람의 시간 지난 대기 초대를 만료로 → [바뀐 수]
const expireDue = (db, { receiverId, now, expiredStatus, pendingStatus }, transaction) => db.GameInvite.update(
    {
        status: expiredStatus,
        end_reason: 'EXPIRED',
        decided_at: now,
        revision: db.sequelize.literal('revision + 1'),
    },
    {
        where: {
            receiver_id: receiverId,
            status: pendingStatus,
            expires_at: { [db.Sequelize.Op.lte]: now },
        },
        transaction,
    },
);

// 같은 보낸 사람·만들기 키 초대
const findByCreationKey = (db, { senderId, creationKey }, transaction) => db.GameInvite.findOne({
    where: { sender_id: senderId, creation_key: creationKey },
    transaction,
});

// 같은 방 인스턴스·부팅으로 아직 살아 있는 대기 초대 (가장 새 것)
const findLivePending = (db, { senderId, receiverId, roomId, roomInstanceId, bootEpoch, status, after }, transaction) => db.GameInvite.findOne({
    where: {
        sender_id: senderId,
        receiver_id: receiverId,
        room_id: roomId,
        room_instance_id: roomInstanceId,
        boot_epoch: bootEpoch,
        status,
        expires_at: { [db.Sequelize.Op.gt]: after },
    },
    order: [['creation_seq', 'DESC']],
    transaction,
});

// 초대 한 줄 만들기
const createInviteRow = (db, row, transaction) => db.GameInvite.create(row, { transaction });

// 받는 사람의 그 상태 초대 + 보낸 사람 닉네임, 순번 순
const listReceivedWithSender = (db, { receiverId, status }, transaction) => db.GameInvite.findAll({
    where: { receiver_id: receiverId, status },
    include: [{ model: db.User, as: 'InviteSender', attributes: ['uuid', 'nickname'] }],
    order: [['creation_seq', 'ASC']],
    transaction,
});

// 받는 사람 초대 중 가장 새 순번 하나
const findNewestForReceiver = (db, receiverId, transaction) => db.GameInvite.findOne({
    where: { receiver_id: receiverId },
    attributes: ['creation_seq'],
    order: [['creation_seq', 'DESC']],
    transaction,
});

// 초대 하나 + 보낸 사람 닉네임
const findWithSender = (db, inviteId, transaction) => db.GameInvite.findOne({
    where: { id: inviteId },
    include: [{ model: db.User, as: 'InviteSender', attributes: ['uuid', 'nickname'] }],
    transaction,
});

// 읽어 둔 초대 행 다시 읽기
const reloadInvite = (row, transaction) => row.reload({ transaction });

// 초대 하나 (잠금 없이, 트랜잭션 안)
const findInviteInTransaction = (db, inviteId, transaction) => db.GameInvite.findOne({ where: { id: inviteId }, transaction });

// 트랜잭션 안에서 초대 잠가 읽기
const lockInvite = (db, inviteId, transaction) => db.GameInvite.findOne({
    where: { id: inviteId }, transaction, lock: transaction.LOCK.UPDATE,
});

// 읽어 둔 초대 행 바꾸기
const saveInvite = (row, patch, transaction) => row.update(patch, { transaction });

// 초대 하나 (트랜잭션 없이)
const findInvite = (db, inviteId) => db.GameInvite.findOne({ where: { id: inviteId } });

// 두 사람 사이 그 상태 초대 (바깥 트랜잭션 그대로 넘김)
const listBetween = (db, { uuidA, uuidB, status }, transaction) => {
    const { Op } = db.Sequelize;
    return db.GameInvite.findAll({
        where: {
            status,
            [Op.or]: [
                { sender_id: uuidA, receiver_id: uuidB },
                { sender_id: uuidB, receiver_id: uuidA },
            ],
        },
        transaction,
    });
};

// 여러 초대를 한 번에 끝냄 (바깥 트랜잭션 그대로 넘김)
const endManyInTransaction = (db, { ids, status, endReason, decidedAt }, transaction) => db.GameInvite.update(
    {
        status,
        end_reason: endReason,
        decided_at: decidedAt,
        revision: db.sequelize.literal('revision + 1'),
    },
    { where: { id: { [db.Sequelize.Op.in]: ids } }, transaction },
);

// 방의 그 상태 초대 (id·보낸 사람·받는 사람만)
const listForRoom = (db, { roomId, status }) => db.GameInvite.findAll({
    where: { room_id: roomId, status },
    attributes: ['id', 'sender_id', 'receiver_id'],
});

// 여러 초대를 한 번에 끝냄 (트랜잭션 없이)
const endMany = (db, { ids, status, endReason, decidedAt }) => db.GameInvite.update(
    {
        status,
        end_reason: endReason,
        decided_at: decidedAt,
        revision: db.sequelize.literal('revision + 1'),
    },
    { where: { id: { [db.Sequelize.Op.in]: ids } } },
);

// 그 시도가 아직 입장 확인 전일 때만 입장 결과 바꾸기 → [바뀐 수]
const markEntryIfUnconfirmed = (db, { inviteId, attemptId, entryOutcome, endReason, unconfirmedOutcome }) => db.GameInvite.update(
    { entry_outcome: entryOutcome, end_reason: endReason },
    {
        where: {
            id: inviteId,
            attempt_id: attemptId,
            entry_outcome: unconfirmedOutcome,
        },
    },
);

module.exports = {
    expireDue,
    findByCreationKey,
    findLivePending,
    createInviteRow,
    listReceivedWithSender,
    findNewestForReceiver,
    findWithSender,
    reloadInvite,
    findInviteInTransaction,
    lockInvite,
    saveInvite,
    findInvite,
    listBetween,
    endManyInTransaction,
    listForRoom,
    endMany,
    markEntryIfUnconfirmed,
};
