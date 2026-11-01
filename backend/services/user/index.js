// 유저 카테고리 입구, 내 프로필 · 닉네임 바꾸기 이름 내보냄
// profile 컨트롤러가 이 입구로 부름 (비번 바꾸기는 인증 쪽 ../auth/account 입구)
const { getMyProfile, changeNickname } = require('./profile');

module.exports = {
    getMyProfile,
    changeNickname,
};
