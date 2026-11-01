// 외부 로그인 제공자 입구, 구글·디스코드를 묶음으로 내보냄
// 두 제공자 함수 이름이 같아(buildAuthorizationUrl 등) 펼치지 않음, 부를 땐 ./google · ./discord 입구 사용
module.exports = {
    google: require('./google'),
    discord: require('./discord'),
};
