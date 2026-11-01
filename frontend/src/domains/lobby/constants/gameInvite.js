// 게임 초대 상수 (수락 응답 기다림 시간·끝난 초대 안내 문구)
// 초대 수락 흐름(friendSocket/inviteAccept)·초대 상태 판정(utils/gameInvite/inviteState)·소켓 훅 입구가 씀

// 수락 응답은 방 입장까지 걸려 길게 기다림
export const INVITE_ACCEPT_TIMEOUT_MS = 15000;

// 결과 다시 묻기·지금 방 확인은 짧게 기다림
export const INVITE_VERIFY_TIMEOUT_MS = 5000;

// 끝난 초대 상태별 안내 문구
export const ENDED_REASON_TEXT = Object.freeze({
    DECLINED: "이미 거절한 초대입니다.",
    EXPIRED: "초대 시간이 지났습니다.",
    ACCEPTED: "이미 수락한 초대입니다.",
    CANCELLED: "더 이상 유효하지 않은 초대입니다.",
});
