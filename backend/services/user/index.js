// 유저 카테고리 입구, 내 프로필 · 닉네임 바꾸기 · 계정 한 명 읽기 이름 내보냄
// profile 컨트롤러·관리자 확인·방 입장이 이 입구로 부름 (비번 바꾸기는 인증 쪽 ../auth/account 입구)
const { getMyProfile, changeNickname, findByUuid } = require('./profile');

module.exports = {
    getMyProfile,
    changeNickname,
    findByUuid,
};
