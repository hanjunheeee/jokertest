// 판 조회 입구, 상수·장부 읽기·참여 확인·진행 중 판·끝난 판 찾기 묶어서 내보냄
// gameSession.js·판 준비·밤·낮·재판·채팅·스냅샷이 이 입구로 사용
module.exports = {
    // 끊김 유예 단계 이름
    ...require('./constants'),
    // 장부 읽기: id로 판 찾기·장부에 있는 그 판인지
    ...require('./registry'),
    // 참여 확인: 기권했는지·참여 중인지·참여 번호
    ...require('./participation'),
    // 진행 중 판: 어느 판인지·유예·나가기 대상·접속 현황
    ...require('./live'),
    // 끝난 판: 남은 사람·다음 방 우편함 자격
    ...require('./ended'),
}
