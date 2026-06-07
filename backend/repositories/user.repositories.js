const db = require("../models");
const { Op } = db.Sequelize;

/**
 * 이메일 또는 로그인 ID로 유저 조회 (중복 가입 방지 및 로그인 시 사용)
 * * @param {String} email - 조회할 이메일 주소
 * @param {String} login_id - 조회할 로그인 아이디
 * @returns {Promise<Object|null>} 일치하는 유저 모델 객체 (없으면 null)
 */
exports.findByEmailOrLoginId = async (email, login_id) => {
  return await db.User.findOne({
    where: {
      [Op.or]: [{ email }, { login_id }],
    },
  });
};

/**
 * 이메일로 특정 유저 단건 조회
 * * @param {String} email - 조회할 이메일 주소
 * @returns {Promise<Object|null>} 일치하는 유저 모델 객체 (없으면 null)
 */
exports.findByEmail = async (email) => {
  return await db.User.findOne({ where: { email } });
};

/**
 * 신규 유저 생성 (회원가입)
 * * @param {Object} userData - 생성할 유저 데이터 (login_id, email, password_hash 등)
 * @returns {Promise<Object>} 생성된 유저 모델 객체
 */
exports.createUser = async (userData) => {
  return await db.User.create(userData);
};

/**
 * 로그인 접속 히스토리 기록
 * 유저의 로그인 시도(성공/실패), IP, 기기 정보 등을 DB에 남깁니다.
 * * @param {Object} historyData - 저장할 히스토리 데이터 (user_id, ip_address, user_agent, success 여부 등)
 * @returns {Promise<Object>} 생성된 로그인 히스토리 객체
 */
exports.createLoginHistory = async (historyData) => {
  return await db.LoginHistory.create(historyData);
};

/**
 * 특정 유저 정보 업데이트
 * 비밀번호 틀린 횟수 초기화, 마지막 접속일 갱신 등에 사용됩니다.
 * * @param {String} uuid - 업데이트할 유저의 고유 식별자(UUID)
 * @param {Object} updateData - 변경할 컬럼과 값들의 객체
 * @returns {Promise<Array>} Sequelize update 결과 배열 (예: [업데이트된 행의 개수])
 */
exports.updateUser = async (uuid, updateData) => {
  return await db.User.update(updateData, { where: { uuid } });
}

/**
 * 유저의 활성화된 정지(Ban) 내역 확인
 * 영구 정지 상태이거나, 정지 해제일(end_at)이 현재 시간보다 미래인 내역이 있는지 검사합니다.
 * * @param {String} user_id - 검사할 유저의 UUID
 * @returns {Promise<Object|null>} 활성화된 정지 내역 객체 (없으면 깨끗한 유저이므로 null 반환)
 */
exports.checkActiveBan = async (user_id) => {
  return await db.UserBan.findOne({
    where: {
      user_id,
      [Op.or]: [
        { is_permanent: true }, // 영구 정지이거나
        { end_at: { [Op.gt]: new Date() } } // 정지 기간이 아직 안 끝났거나
      ]
    }
  });
};

/**
 * 신규 유저 세션 생성 (접속 상태 관리)
 * 현재 접속 중인 기기 정보와 상태(is_online)를 저장합니다.
 * * @param {Object} sessionData - 세션 데이터 (user_id, ip_address, is_online 등)
 * @returns {Promise<Object>} 생성된 유저 세션 객체
 */
exports.createUserSession = async (sessionData) => {
  return await db.UserSession.create(sessionData);
}