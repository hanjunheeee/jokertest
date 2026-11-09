'use strict';

// 탈퇴 저장소 파일, 계정 알아볼 수 없게 바꾸고 닫기 · 딸린 연결(세션·소셜·친구·초대·접속·인증) 정리
// 탈퇴 서비스(services/auth/account/withdraw.js)가 트랜잭션 안에서 부름, 전적·장부·동의 기록은 uuid로 남김
const db = require('../../models');

// 탈퇴 계정 표시 (전적에 남는 이름)
const WITHDRAWN_NICKNAME_SNAPSHOT = '탈퇴한 사용자';
const WITHDRAWN_STATUS = 'WITHDRAWN';

// 알아볼 수 없는 이메일·닉네임 (uuid로 만들어 겹치지 않음, 같은 이메일·닉네임으로 다시 가입 가능)
// 예: uuid 1b2c...-... → withdrawn-1b2c...@withdrawn.invalid · 탈퇴1b2c3d...(32자)
const anonymousEmailOf = (uuid) => `withdrawn-${uuid}@withdrawn.invalid`;
const anonymousNicknameOf = (uuid) => `탈퇴${String(uuid).replace(/-/g, '')}`;

// 계정 줄: 상태 WITHDRAWN·이메일·닉네임 바꿈·생일·사진 지움 → deleted_at 채움 (행은 남음)
const closeAccount = async (uuid, { transaction }) => {
    await db.User.update({
        email: anonymousEmailOf(uuid),
        nickname: anonymousNicknameOf(uuid),
        status: WITHDRAWN_STATUS,
        profile_image_url: null,
        birth_date: null,
        failed_login_count: 0,
        locked_until: null,
    }, { where: { uuid }, transaction });
    // paranoid 모델이라 destroy는 deleted_at만 채움
    await db.User.destroy({ where: { uuid }, transaction });
};

// 딸린 연결 정리: 세션 끊기 · 소셜 연결 · 친구·신청·즐겨찾기·차단 · 대기 초대 취소 · 접속 줄 · 인증·재설정 줄
const detachAccount = async (uuid, oldEmail, { transaction, now = new Date() }) => {
    const { Op } = db.Sequelize;
    const either = (a, b) => ({ [Op.or]: [{ [a]: uuid }, { [b]: uuid }] });

    await db.UserSession.update(
        { is_online: false, revoked_at: now },
        { where: { user_id: uuid, revoked_at: null }, transaction },
    );
    // 세션 끊김 알림은 여기서 안 함: 탈퇴 서비스가 커밋 뒤 소켓 안내·끊기 다음에 보냄 (다른 Node에 안내가 먼저 닿게)
    await db.ExternalIdentity.destroy({ where: { user_id: uuid }, transaction });
    await db.Friendship.destroy({ where: either('requester_id', 'receiver_id'), transaction });
    await db.FriendRequest.destroy({ where: either('requester_id', 'receiver_id'), transaction });
    await db.FriendFavorite.destroy({ where: either('owner_id', 'friend_id'), transaction });
    await db.FriendBlock.destroy({ where: either('owner_id', 'blocked_id'), transaction });
    await db.GameInvite.update({
        status: 'CANCELLED',
        end_reason: 'ACCOUNT_WITHDRAWN',
        decided_at: now,
        revision: db.sequelize.literal('revision + 1'),
    }, { where: { status: 'PENDING', ...either('sender_id', 'receiver_id') }, transaction });
    await db.OnlinePresence.destroy({ where: { user_id: uuid }, transaction });
    await db.PasswordResetToken.destroy({ where: { user_id: uuid }, transaction });
    if (typeof oldEmail === 'string' && oldEmail) {
        await db.SignupEmailVerification.destroy({ where: { email: oldEmail.toLowerCase() }, transaction, logging: false });
    }
    // 전적은 이름 없이 남김
    await db.GameResultPlayer.update(
        { nickname_snapshot: WITHDRAWN_NICKNAME_SNAPSHOT },
        { where: { user_id: uuid }, transaction },
    );
};

module.exports = {
    WITHDRAWN_NICKNAME_SNAPSHOT,
    WITHDRAWN_STATUS,
    anonymousEmailOf,
    anonymousNicknameOf,
    closeAccount,
    detachAccount,
};
