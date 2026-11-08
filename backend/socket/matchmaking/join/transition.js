// 방 전환 잠금 파일
// 방 만들기·입장·매칭 중복 잠금 + 세대 번호 (지도 01-③④)
// join·create·queue·초대 accept가 잠금, 판 끝 정리(room/sessionCleanup)가 세대 올림
const { pendingRoomTransitions, generationByUuid } = require('../core/state')
const { forgetPartyOriginToken } = require('./partyOrigin')

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
    forgetPartyOriginToken(token)
}

// 사람 세대 번호 (없으면 0)
function getGeneration(uuid) {
    return generationByUuid.get(uuid) ?? 0
}

// 세대 번호 +1, 그 전에 시작한 요청은 커밋 못 함
// 처리 중 요청이 없으면 막을 것도 없어 칸을 지움 (사람마다 쌓이기만 하던 장부 줄이기, BE-033)
// 요청은 토큰 꽂은 뒤에야 세대 번호를 읽어서, 지워도 옛 번호로 통과하는 요청 없음
function bumpGeneration(uuid) {
    if (!pendingRoomTransitions.has(uuid)) {
        generationByUuid.delete(uuid)
        return
    }
    generationByUuid.set(uuid, getGeneration(uuid) + 1)
}

module.exports = {
    acquireRoomTransition,
    releaseRoomTransition,
    getGeneration,
    bumpGeneration,
}
