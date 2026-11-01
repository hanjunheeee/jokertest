'use strict';

// 게임 초대 상수 파일, 유효 시간·초대 상태·입장 결과·방 접근 없음 기본값
// gameInvite 안 파일들(deps·guards·create·cancel·entry·queries·index)이 씀

// 초대는 3분 동안만 유효
const INVITE_TTL_MS = 3 * 60 * 1000;

// 초대 상태 (대기 → 수락 / 거절·취소·만료, 입장 결과는 아래 따로)
const INVITE_STATUS = Object.freeze({
    PENDING: 'PENDING',
    ACCEPTED: 'ACCEPTED',
    DECLINED: 'DECLINED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
});

// 수락 뒤 입장 결과 (확인 전 → 입장됨 / 중단)
const ENTRY_OUTCOME = Object.freeze({
    UNCONFIRMED: 'UNCONFIRMED',
    PUBLISHED: 'PUBLISHED',
    INTERRUPTED: 'INTERRUPTED',
});

// socket/matchmaking.js가 방 접근자 넣기 전 기본값 (방 없음·초대 못 받음으로 봄)
const NO_ROOM_ACCESS = Object.freeze({
    bootEpoch: 'unbound',
    describeRoomForInvite: () => null,
    getRoomIdForUser: () => null,
    describeReceiverAvailability: () => ({ available: false, code: 'ROOM_ACCESS_UNAVAILABLE' }),
});

module.exports = {
    INVITE_TTL_MS,
    INVITE_STATUS,
    ENTRY_OUTCOME,
    NO_ROOM_ACCESS,
};
