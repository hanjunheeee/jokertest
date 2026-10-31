// 나가기 입구, 끊김 탈락·게임 중 나가기 묶어서 내보냄
module.exports = {
    ...require('./eliminate'),
    ...require('./leave'),
}
