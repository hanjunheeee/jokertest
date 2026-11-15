// 판 참가자 대기방 정리 파일
// 판에서 빠진 사람이 남겨 둔 방장 자리 풀기, gameSession departure/end가 matchmaking.js 거쳐 부름 (지도 02·07)
// 판 끝·판에서 나가기 때 불림, 대기방 자리·입장 시도·처리 중 요청·매칭 줄은 안 건드림
const { releaseReservedHostFor } = require('./returnRoom')

// 판 참가자 정리: 끝난 판 원래 방장이 빠지면 같은 방에 남겨 둔 방장 자리를 끝내고 먼저 들어온 사람이 방장
// 자리 빼기는 안 함: 판 끝 뒤 자리는 전부 본인이 "대기방으로"·코드로 고른 것 (서버가 끌어다 넣던 자동 입장 없어짐)
// 빼면 결과 화면을 닫거나 끊긴 순간 방금 들어간 방에서 쫓겨남 (B06-4), 진행 중 판 사람은 처음부터 방·줄에 못 들어감
function cleanupRoomStateForSessionParticipants(io, inputUuids) {
    for (const uuid of inputUuids ?? []) {
        try {
            releaseReservedHostFor(io, uuid)
        } catch (err) {
            console.error('[세션 종료 Room 정리 실패]', err)
        }
    }
}

module.exports = {
    cleanupRoomStateForSessionParticipants,
}
