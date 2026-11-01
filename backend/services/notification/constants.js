'use strict';

// 알림 상수 파일, 알림 종류·환영 알림·uuid 모양·출처 키 만들기
// 만들기·관리 파일과 친구·초대·업적 쪽이 같이 씀

// 알림 종류 (프론트 아이콘·효과음이 이 값으로 나뉨)
const NOTIFICATION_TYPES = Object.freeze({
    FRIEND_REQUEST: 'friend-request',
    GAME_INVITE: 'game-invite',
    ACHIEVEMENT: 'achievement',
    SYSTEM: 'system',
});

// 가입 뒤 한 번만 보내는 환영 알림
const SYSTEM_WELCOME = Object.freeze({
    sourceKey: 'system:notifications-available:v1',
    type: NOTIFICATION_TYPES.SYSTEM,
    title: '알림 기능 안내',
    body: '친구 요청과 업적 보상은 알림에서 확인하고, 표시 설정은 환경설정에서 변경할 수 있습니다.',
    target: { kind: 'settings' },
});

// 같은 친구 신청 알림 두 번 안 만들게 출처 키
const friendRequestSourceKey = (requestId) => `friend-request:${requestId}:received`;

// 같은 업적 알림 두 번 안 만들게 출처 키
const achievementSourceKey = (achievementId) => `achievement:${achievementId}:granted`;

// 같은 초대 알림 두 번 안 만들게 출처 키
const gameInviteSourceKey = (inviteId) => `game-invite:${inviteId}:received`;

// 읽음 처리 때 알림 id 모양 확인
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

module.exports = {
    NOTIFICATION_TYPES,
    SYSTEM_WELCOME,
    friendRequestSourceKey,
    achievementSourceKey,
    gameInviteSourceKey,
    UUID_PATTERN,
};
