/**
 * 비밀번호 해시/검증 유틸리티.
 *
 * 컨트롤러나 서비스가 bcrypt 세부 설정에 의존하지 않도록 암호화 책임을 모읍니다.
 */
const bcrypt = require("bcrypt");

/**
 * 평문 비밀번호를 bcrypt 해시로 변환합니다.
 * @param {string} plainPassword - 사용자가 입력한 평문 비밀번호
 * @returns {Promise<string>}
 */
exports.hashPassword = async (plainPassword) => {
    return await bcrypt.hash(plainPassword, 10);
};

/**
 * 평문 비밀번호와 저장된 해시가 일치하는지 확인합니다.
 * @param {string} plainPassword - 사용자가 입력한 평문 비밀번호
 * @param {string} hashedPassword - DB에 저장된 비밀번호 해시
 * @returns {Promise<boolean>}
 */
exports.comparePassword = async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
};
