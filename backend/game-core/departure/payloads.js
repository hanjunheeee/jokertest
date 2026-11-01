// 나가기 방송 내용 파일
// 끊김 탈락 방송 내용 만들기, 상태는 안 바꿈 (탈락 처리는 eliminate.js)
// socket 쪽 방송이 gameSession.js 통해서 사용

// 끊김 탈락 방송 (생존 목록·탈락한 사람)
function buildDisconnectEliminationPayload(session, victimUuid) {
    return {
        gameId: session.id,
        phase: session.phase,
        dayIndex: session.dayIndex,
        // 역할·죽은 이유 없이 uuid·생존만 (지도 12-⑧)
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, alive })),
        victimUuid,
    }
}

module.exports = {
    buildDisconnectEliminationPayload,
}
