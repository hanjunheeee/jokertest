// 필요한 모듈 불러오기
// 단방향 암호화(해싱)를 위해 강력한 보안을 제공하는 bcrypt 모듈을 가져옵니다.
const bcrypt = require("bcrypt");

// 비밀번호 유틸리티 함수 정의
/**
 * @desc    평문 비밀번호를 안전하게 암호화(해싱)합니다.
 * 회원가입 시 사용자의 비밀번호를 DB에 저장하기 전에 호출됩니다. (Salt rounds: 10)
 * @param   {String} plainPassword - 사용자가 입력한 평문 비밀번호
 * @returns {Promise<String>} 암호화된 비밀번호 문자열 (해시값)
 */
exports.hashPassword = async (plainPassword) => {
    return await bcrypt.hash(plainPassword, 10);
};

/**
 * @desc    입력받은 평문 비밀번호와 DB에 저장된 해시값을 비교하여 일치 여부를 검증합니다.
 * 로그인 시도 시 사용자가 입력한 비밀번호가 맞는지 확인할 때 호출됩니다.
 * @param   {String} plainPassword - 사용자가 로그인 시 입력한 평문 비밀번호
 * @param   {String} hashedPassword - DB에 저장되어 있던 암호화된 비밀번호
 * @returns {Promise<Boolean>} 일치하면 true, 틀리면 false 반환
 */
exports.comparePassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};