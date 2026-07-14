// 비밀번호를 안전하게 해시하고 비교하기 위한 라이브러리입니다.
const bcrypt = require("bcrypt");

// 회원가입/비밀번호 변경 시, 사용자가 입력한 원문 비밀번호를 해시 문자열로 바꿉니다.
// 두 번째 인자 10은 salt round 값이고, 숫자가 클수록 더 느리지만 계산 비용이 커집니다.
exports.hashPassword = async (plainPassword) => {
    return await bcrypt.hash(plainPassword, 10);
};

// 로그인 시, 사용자가 입력한 비밀번호와 DB에 저장된 해시 비밀번호가 같은지 확인합니다.
// 같으면 true, 다르면 false를 반환합니다.
exports.comparePassword = async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
}
