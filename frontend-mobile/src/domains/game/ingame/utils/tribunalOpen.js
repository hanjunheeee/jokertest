// 재판 연출이 떠 있는지 고르는 함수 하나 (데스크톱 InGameChatShell과 같은 조건)
// 카톡형 TalkLayout·넓은 배치 ChatPanel·연출 층 useOverlayLayer가 씀, 세 곳 조건이 어긋나지 않게 한곳에 둠

// state = 인게임 스토어 판 상태 (s.state), 피고가 있고 판정 전일 때만 열림
export function isTribunalPresentationOpen(state) {
    return state?.phase === "TRIBUNAL"
        && Boolean(state?.tribunal?.defendantUuid)
        && state.tribunal.resolved !== true
}

// useInGameStore 고르개 모양 (스토어 통째로 받음)
export function selectTribunalPresentationOpen(store) {
    return isTribunalPresentationOpen(store.state)
}
