// 방 전환 잠금 파일
// 방 만들기·입장·매칭 중복 잠금 + 세대 번호 (지도 01-③④)
// join·create·queue·초대 accept가 잠금, 판 끝 정리(room/sessionCleanup)가 세대 올림
const { pendingRoomTransitions, generationByUuid } = require('../core/state')

// 처리 중 토큰 번호
let roomTransitionTokenSeq = 0

// 처리 중 토큰 꽂기, 이미 있으면 null (두 번 클릭 막기)
function acquireRoomTransition(uuid) {
    if (pendingRoomTransitions.has(uuid)) return null
    roomTransitionTokenSeq += 1
    const token = `rt-${roomTransitionTokenSeq}`
    pendingRoomTransitions.set(uuid, token)
    return token
}

// 내 토큰일 때만 뽑기 (남의 토큰 뽑으면 그쪽 잠금이 풀림)
function releaseRoomTransition(uuid, token) {
    if (pendingRoomTransitions.get(uuid) === token) pendingRoomTransitions.delete(uuid)
}

// 사람 세대 번호 (없으면 0)
function getGeneration(uuid) {
    return generationByUuid.get(uuid) ?? 0
}

// 세대 번호 +1, 그 전에 시작한 요청은 커밋 못 함
function bumpGeneration(uuid) {
    generationByUuid.set(uuid, getGeneration(uuid) + 1)
}

module.exports = {
    acquireRoomTransition,
    releaseRoomTransition,
    getGeneration,
    bumpGeneration,
}
