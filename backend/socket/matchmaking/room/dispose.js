// 방 없애기 공통 파일
// 빈 방·지운 방 정리 한 곳 + 방 초대 취소, 나가기·방 지우기·판 끝 정리·입장 되돌리기가 같이 씀 (known 1-11)
// 길마다 정리가 달라 입장 시도·초대가 남던 문제 막으려고 한 함수로 모음
const { gameRooms } = require('../core/state')
const { invalidateRoomAttempts } = require('../admission/attempts')
const { forgetSettingsResults } = require('../settings/receipts')
const { deps } = require('../core/deps')

// 방이 없어지거나 시작되면 그 방 대기 초대 전부 취소 (안 기다림, 실패는 로그만)
function cancelRoomInvitesAsync(roomId, reason) {
    Promise.resolve()
        .then(() => deps.gameInviteService.cancelPendingInvitesForRoom(roomId, reason))
        .catch((err) => console.error('[방 소멸 초대 정리 실패]', err))
}

// 방 없애기: 방·입장 시도·설정 영수증·대기 초대 한 번에 정리
// 소속 장부(playerRoom)·알림·공개 목록은 부른 쪽이 맡음 (길마다 알릴 사람이 달라서)
function disposeRoom(roomId, reason) {
    gameRooms.delete(roomId)
    invalidateRoomAttempts(roomId, reason)
    forgetSettingsResults(roomId)
    cancelRoomInvitesAsync(roomId, reason)
}

module.exports = {
    cancelRoomInvitesAsync,
    disposeRoom,
}
