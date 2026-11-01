// 역할 공개 확인 파일
// 역할 확인 버튼 받기 + 전원 확인됐는지
// socket 쪽이 gameSession.js 통해서 사용, 전원 확인 검사는 나가기 쪽도 씀
const { findActorSession } = require('../core/registry/lookup')
const { enterDayPhase } = require('../phase/day/state')
const { isParticipatingInSession } = require('../queries/participation')

// "역할 확인" 누른 사람 기록, 전원 확인되면 첫 낮으로
function acknowledgeRoleReveal(uuid, gameId) {
    // 판 id 확인 + 내 판 찾기, 내가 판에 있는지 (지난 판 화면에서 보낸 것 거절)
    const found = findActorSession(uuid, gameId, { requireActor: false })
    if (!found.ok) return found
    const { session } = found

    // 역할 확인 단계일 때만 (이미 낮이 된 판에 또 온 것 거절)
    if (session.phase !== 'ROLE_REVEAL') return { ok: false, code: 'INVALID_PHASE' }

    // 이미 확인했으면 아무것도 안 바꾸고 ok만 (연결마다 또 보내도 됨, 지도 03-④)
    if (session.roleRevealAcks.has(uuid)) return { ok: true, transitioned: false, session }

    // 여기부터 진짜 바뀜: 확인 명단에 나 추가
    session.roleRevealAcks.add(uuid)
    // 마지막 한 명이면 첫 낮으로 넘김
    if (isRoleRevealComplete(session)) {
        enterDayPhase(session)
        return { ok: true, transitioned: true, session }
    }
    return { ok: true, transitioned: false, session }
}

// 참여 중인 사람 전원 확인했는지
function isRoleRevealComplete(session) {
    // 나간 사람은 빼고 셈 (나간 사람 때문에 영영 안 모이는 것 막기, 지도 03-⑤)
    const pending = [...session.players.values()].filter((player) => isParticipatingInSession(session, player.uuid))
    // 남은 사람이 없으면 "다 확인함"으로 치지 않음
    if (pending.length === 0) return false
    return pending.every((player) => session.roleRevealAcks.has(player.uuid))
}

module.exports = {
    acknowledgeRoleReveal,
    isRoleRevealComplete,
}