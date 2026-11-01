// 단계 넘기기 파일
// 밤으로 넘기기(밤 기록 새로), 재판 판정·낮 판정·게임 중 나가기가 사용
// 낮·재판·나가기가 다 써서 phase/night 말고 core에 둠 (낮↔밤 require 막기)

// 밤 시작: 단계 NIGHT, 밤 행동·판정·진행 기록 새로 (지난 밤 것 안 섞이게)
function enterNightPhase(session) {
    session.phase = 'NIGHT'
    session.nightActions = new Map()
    session.nightResolution = null
    session.nightProgress = null
}

module.exports = { enterNightPhase }
