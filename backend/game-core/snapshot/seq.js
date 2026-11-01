// 내 진행 번호 파일
// 판의 내 진행 번호 올리기 (상태 바뀜), 진행 표시·스냅샷 만들기랑 따로 둠
// socket 쪽이 내 제출 알림 보낼 때 gameSession.js 통해서 사용

// 내 진행 번호 +1 (늦게 온 옛 알림 거르기용)
function bumpSelfProgressSeq(session) {
    // 이상한 값이면 0부터 다시
    const next = (Number.isSafeInteger(session.selfProgressSeq) ? session.selfProgressSeq : 0) + 1
    session.selfProgressSeq = next
    return next
}

module.exports = {
    bumpSelfProgressSeq,
}
