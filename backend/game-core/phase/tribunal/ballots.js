// 재판 투표함 파일
// 투표할 사람·표 묶음·세기 + 판정 보관함, 재판 판정·나가기·진행 표시가 사용

// 재판 판정 prepare 결과 보관함 (판 하나당 하나, 다시 prepare하면 덮어씀)
// commit 때 이거랑 지금 투표 묶음이 같아야 확정 (지도 04-⑦)
const TRIBUNAL_PENDING = new WeakMap()

// 재판 투표할 수 있는 사람 (산 사람 중 피고 빼고)
function getEligibleTribunalVoterUuids(session, defendantUuid) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive && player.uuid !== defendantUuid) uuids.push(player.uuid)
    }
    return uuids
}

// 지금 투표 상태 묶음 (누가 뭘 찍었나)
function buildTribunalBallotSnapshot(session, tribunal) {
    const eligibleVoterUuids = getEligibleTribunalVoterUuids(session, tribunal.defendantUuid)
    // 투표할 사람마다 낸 표 (안 냈으면 빈 값)
    const snapshot = eligibleVoterUuids.map((voterUuid) => ({ voterUuid, choice: tribunal.votes.get(voterUuid) }))
    // 투표자 순서로 정렬 (비교 때 순서 안 꼬이게)
    snapshot.sort((a, b) => {
        if (a.voterUuid < b.voterUuid) return -1
        if (a.voterUuid > b.voterUuid) return 1
        return 0
    })
    return snapshot
}

// 유죄·무죄 세기
function tallyTribunalBallots(ballotSnapshot, defendantUuid) {
    let guilty = 0
    let notGuilty = 0
    for (const { choice } of ballotSnapshot) {
        if (choice === 'GUILTY') guilty += 1
        else if (choice === 'NOT_GUILTY') notGuilty += 1
    }
    // 유죄가 더 많아야 유죄, 같으면 무죄
    const outcome = guilty > notGuilty ? 'GUILTY' : 'NOT_GUILTY'
    return { counts: { guilty, notGuilty }, outcome, executedUuid: outcome === 'GUILTY' ? defendantUuid : null }
}

// 투표 묶음 둘이 같은지 (prepare 뒤에 표가 바뀌었는지 확인)
function isSameBallots(a, b) {
    if (a.length !== b.length) return false
    // 칸마다 투표자·표 비교
    for (let i = 0; i < a.length; i += 1) {
        if (a[i].voterUuid !== b[i].voterUuid || a[i].choice !== b[i].choice) return false
    }
    return true
}

module.exports = {
    TRIBUNAL_PENDING,
    getEligibleTribunalVoterUuids,
    buildTribunalBallotSnapshot,
    tallyTribunalBallots,
    isSameBallots,
}