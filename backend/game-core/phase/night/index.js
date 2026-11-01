// 밤 입구, 상수·자격·진행 기록·역할 차례·행동 받기·판정 대장·판정 준비·확정·방송 묶어서 내보냄
// gameSession.js·나가기·판 만들기·스냅샷이 여기서 가져다 씀
module.exports = {
    // 밤 순서·시간·판정 방식 같은 고정 값
    ...require('./constants'),
    // 누가 행동할 수 있는지, 차례 순서
    ...require('./actors'),
    // 역할별로 끝났는지 적는 진행 기록
    ...require('./progress'),
    // 역할 차례 시작·확정·끝
    ...require('./roleStep'),
    // 밤 행동 대상 받기
    ...require('./submit'),
    // 판정 준비 출처 대장 (prepare가 만든 것만 commit)
    ...require('./preparation'),
    // 밤 판정 준비: 누가 죽나 계산만
    ...require('./prepare'),
    // 밤 판정 확정: 진짜 죽이고 낮으로
    ...require('./commit'),
    // 밤 방송 내용·사망 공개 목록
    ...require('./payloads'),
}
