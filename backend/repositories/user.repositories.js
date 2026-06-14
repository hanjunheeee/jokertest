/**
 * @file    user.repositories.js
 * @desc    유저(User) 관련 DB 접근을 전담하는 레포지토리 계층입니다.
 *          Sequelize ORM을 직접 사용하며, 비즈니스 로직은 포함하지 않습니다.
 *
 *  사용 모델 목록
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  User          유저 기본 정보 (uuid, email, nickname 등)          │
 *  │  LoginHistory  로그인 시도 이력 (IP, 기기 종류, 성공 여부)         │
 *  │  UserBan       정지(밴) 내역 (기간 정지 · 영구 정지)               │
 *  │  UserSession   세션 정보 (현재 접속 기기, IP, 온라인 여부)         │
 *  └──────────────────────────────────────────────────────────────────┘
 */

const db     = require("../models");
const { Op } = db.Sequelize;

// ──────────────────────────────────────────────
// 유저 조회
// ──────────────────────────────────────────────

/**
 * @desc    이메일로 유저를 조회합니다.
 *          회원가입 시 중복 이메일 검사, 로그인 시 계정 검색에 사용됩니다.
 *
 * @param   {string} email - 조회할 이메일 주소
 * @returns {Promise<Object|null>} 일치하는 User 인스턴스 (없으면 null)
 */
exports.findByEmail = async (email) => {
    return await db.User.findOne({ where: { email } });
};

// ──────────────────────────────────────────────
// 유저 생성 · 수정
// ──────────────────────────────────────────────

/**
 * @desc    신규 유저를 DB에 생성합니다. (회원가입)
 *          패스워드는 이미 서비스 계층에서 bcrypt 해싱된 상태로 전달됩니다.
 *
 * @param   {Object} userData - 생성할 유저 데이터 { email, password_hash, nickname }
 * @returns {Promise<Object>} 생성된 User Sequelize 인스턴스
 */
exports.createUser = async (userData) => {
    return await db.User.create(userData);
};

/**
 * @desc    특정 유저의 컬럼을 업데이트합니다.
 *          비밀번호 틀린 횟수(failed_login_count) 초기화,
 *          마지막 접속일(last_login_at) 갱신 등에 사용됩니다.
 *
 * @param   {string} uuid       - 업데이트할 유저의 UUID
 * @param   {Object} updateData - 변경할 컬럼과 값 { key: value, ... }
 * @returns {Promise<Array>}    Sequelize update 결과 [업데이트된 행 수]
 */
exports.updateUser = async (uuid, updateData) => {
    return await db.User.update(updateData, { where: { uuid } });
};

// ──────────────────────────────────────────────
// 로그인 이력
// ──────────────────────────────────────────────

/**
 * @desc    로그인 시도 이력을 DB에 기록합니다.
 *          성공·실패 여부와 함께 IP, 기기 종류, User-Agent를 저장합니다.
 *
 * @param   {Object} historyData - 저장할 이력 데이터 { user_id, ip_address, user_agent, device_type, success }
 * @returns {Promise<Object>} 생성된 LoginHistory Sequelize 인스턴스
 */
exports.createLoginHistory = async (historyData) => {
    return await db.LoginHistory.create(historyData);
};

// ──────────────────────────────────────────────
// 계정 제재 (Ban)
// ──────────────────────────────────────────────

/**
 * @desc    유저에게 현재 활성화된 정지(Ban) 내역이 있는지 확인합니다.
 *          영구 정지(is_permanent = true) 이거나
 *          기간 정지(end_at > 현재 시각) 조건 중 하나라도 해당하면 객체를 반환합니다.
 *          로그인 시 사전 차단 용도로 사용됩니다.
 *
 * @param   {string} user_id - 검사할 유저의 UUID
 * @returns {Promise<Object|null>} 활성 제재 내역 (없으면 null → 정상 계정)
 */
exports.checkActiveBan = async (user_id) => {
    return await db.UserBan.findOne({
        where: {
            user_id,
            [Op.or]: [
                { is_permanent: true },
                { end_at: { [Op.gt]: new Date() } }
            ]
        }
    });
};

// ──────────────────────────────────────────────
// 세션
// ──────────────────────────────────────────────

/**
 * @desc    새 유저 세션을 DB에 생성합니다.
 *          로그인 성공 시 호출되며, 현재 접속 중인 기기와 온라인 상태를 기록합니다.
 *
 * @param   {Object} sessionData - 세션 데이터 { user_id, ip_address, device_type, is_online }
 * @returns {Promise<Object>} 생성된 UserSession Sequelize 인스턴스
 */
exports.createUserSession = async (sessionData) => {
    return await db.UserSession.create(sessionData);
};
