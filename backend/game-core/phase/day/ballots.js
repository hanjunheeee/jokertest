// 낮 투표함 파일
// 투표할 사람·표 묶음·세기 + 묶음 비교, 낮 판정·준비·나가기·진행 표시·socket 낮 진행이 사용
const { getDayVoteExcludedUuids } = require('./state')

// 낮 투표할 수 있는 사람 (산 사람)
function getDayVoterUuids(session) {
    const uuids = []
    for (const player of session.players.values()) {
        if (player.alive) uuids.push(player.uuid)
    }
    return uuids
}

// uuid 목록 둘이 순서까지 같은지
function uuidListsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false
    }
    return true
}

// 낮 표 세기: 최다 득표자 한 명이면 재판, 동률이면 재투표 또는 밤
function tallyDayVoteOutcome(session) {
    const eligibleVoterUuids = getDayVoterUuids(session)
    const excludedUuids = getDayVoteExcludedUuids(session)
    const voteCounts = new Map()
    let abstainCount = 0
    // 기권·안 낸 표·재투표 제외자 표는 기권으로 셈
    for (const voterUuid of eligibleVoterUuids) {
        const targetId = session.dayVotes.get(voterUuid)
        if (targetId === null || targetId === undefined || excludedUuids.has(targetId)) {
            abstainCount += 1
            continue
        }
        voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1)
    }
    // 방송에 내보낼 수 (누가 누굴 찍었는지는 빼고)
    const publicVoteCount = eligibleVoterUuids.length
    const publicAbstainCount = abstainCount

    // 아무도 안 찍었으면 전원 기권
    if (voteCounts.size === 0) {
        return { outcome: 'ABSTAINED', tribunalTargetUuid: null, tiedTargetUuids: [], publicVoteCount, publicAbstainCount }
    }

    // 가장 많이 받은 표 수 찾고, 그만큼 받은 사람 모으기 (순서 고정)
    let winnerVotes = 0
    for (const votes of voteCounts.values()) {
        if (votes > winnerVotes) winnerVotes = votes
    }
    const topTargetUuids = [...voteCounts.entries()]
        .filter(([, votes]) => votes === winnerVotes)
        .map(([target]) => target)
        .sort()

    // 최다 득표자 여럿이면 동률
    if (topTargetUuids.length > 1) {
        return {
            outcome: 'TIE',
            tribunalTargetUuid: null,
            tiedTargetUuids: topTargetUuids,
            publicVoteCount,
            publicAbstainCount,
        }
    }
    // 한 명이면 그 사람이 재판에 섬
    return {
        outcome: 'TRIBUNAL',
        tribunalTargetUuid: topTargetUuids[0],
        tiedTargetUuids: [],
        publicVoteCount,
        publicAbstainCount,
    }
}

// 지금 낮 표 묶음 (누가 누구 찍었나)
function buildDayBallotSnap(session) {
    // 투표자 정렬 (비교 때 순서 안 꼬이게), 안 낸 표는 null
    const ballots = getDayVoterUuids(session)
        .slice()
        .sort()
        .map((voterUuid) => {
            const target = session.dayVotes.get(voterUuid)
            return Object.freeze([voterUuid, target === undefined ? null : target])
        })
    return Object.freeze(ballots)
}

// 낮 표 묶음 둘이 같은지 (prepare 뒤에 표 바뀌었는지)
function dayBallotSnapsEqual(a, b) {
    // 길이 같고 칸마다 투표자·대상이 같아야 같음 (지도 04-⑦)
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false
    }
    return true
}

module.exports = {
    getDayVoterUuids,
    uuidListsEqual,
    tallyDayVoteOutcome,
    buildDayBallotSnap,
    dayBallotSnapsEqual,
}