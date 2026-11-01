// 나가기 입구, 끊김 탈락·게임 중 나가기·방송 내용 묶어서 내보냄
// gameSession.js가 이 입구로 가져다 씀
module.exports = {
    ...require('./eliminate'),
    ...require('./leave'),
    ...require('./payloads'),
}
