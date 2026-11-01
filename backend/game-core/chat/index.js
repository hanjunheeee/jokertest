// 채팅 입구, 상수·규칙·보내기 묶어서 내보냄
// gameSession.js·setup이 이 입구로 가져다 사용
module.exports = {
    // 글자 수·간격·채널 목록
    ...require('./constants'),
    // 글 검사·채널 정하기·받는 사람
    ...require('./rules'),
    // 채팅 prepare/commit
    ...require('./messages'),
}