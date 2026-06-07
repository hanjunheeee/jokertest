// 필요한 모듈 불러오기
// DB 통신을 위한 레포지토리와 암호화(Hash), 토큰(JWT) 유틸리티 등을 가져옵니다.
const userRepository = require("../repositories/user.repositories");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");
const crypto = require("crypto");
const db = require("../models");

// 서비스 계층 로직 정의
/**
 * @desc    회원가입 비즈니스 로직
 * 이메일/아이디 중복 여부를 확인하고, 비밀번호를 안전하게 암호화하여 DB에 저장합니다.
 * @param   {Object} UserData - 클라이언트가 보낸 가입 정보 (login_id, email, password, nickname)
 * @returns {Promise<Object>} 생성된 유저 모델 객체
 */
exports.signup = async (UserData) => {
    const { login_id, email, password, nickname } = UserData;

    // 중복 가입 검증
    const existingUser = await userRepository.findByEmailOrLoginId(email, login_id);
    if(existingUser) {
        throw new Error("이미 사용 중인 이메일이거나 아이디입니다.");
    }

    // 비밀번호 해싱
    const password_hash = await hashPassword(password);

    // 유저 생성
    const newUser = await userRepository.createUser({
        login_id,
        email,
        password_hash,
        nickname,
    });

    return newUser;
};

/**
 * @desc    로그인 비즈니스 로직
 * 계정 상태(잠금/정지)를 확인하고, 비밀번호 검증, 접속 기록 저장 및 세션 관리를 수행합니다.
 * @param   {Object} loginData - 클라이언트가 입력한 로그인 정보 (email, password)
 * @param   {Object} reqInfo - 클라이언트 기기 및 IP 정보
 * @returns {Promise<Object>} 검증 완료된 유저 객체와 발급된 JWT 토큰 반환 { user, token }
 */
exports.login = async (loginData, reqInfo) => {
    const { email, password } = loginData;

    // 유저 존재 여부 확인
    const user = await userRepository.findByEmail(email);
    if(!user) {
        throw new Error("가입되지 않은 이메일입니다.");
    }

    // 계정 잠금 상태 확인 (5회 오입력 페널티)
    if(user.locked_until && user.locked_until > new Date()){
        throw new Error("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.");
    }

    // 계정 정지(Ban) 내역 확인
    const activeBan = await userRepository.checkActiveBan(user.uuid);
    if(activeBan) {
        const banReason = activeBan.reason || "운영정책 위반";
        throw new Error(`정지된 계정입니다. 사유: ${banReason}`);
    }

    // 비밀번호 일치 여부 검증
    const isMatch = await comparePassword(password, user.password_hash);

    // 로그인 시도 히스토리 기록 (성공/실패 모두 기록)
    await userRepository.createLoginHistory({
        user_id: user.uuid,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        success: isMatch,
    });

    // 비밀번호가 틀렸을 경우의 페널티 로직
    if(!isMatch) {
        const failCount = user.failed_login_count + 1;
        const lockedUntil = failCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

        await userRepository.updateUser(user.uuid, {
            failed_login_count: failCount,
            locked_until: lockedUntil
        });

        if (lockedUntil) {
            throw new Error("비밀번호를 5회 잘못 입력하여 15분간 계정이 잠깁니다.");
        }
        throw new Error(`비밀번호가 일치하지 않습니다. (틀린 횟수: ${failCount}/5)`);
    }

    // 로그인 성공 처리 (실패 카운트 초기화 및 마지막 접속일 갱신)
    await userRepository.updateUser(user.uuid, {
        failed_login_count: 0,
        locked_until: null,
        last_login_at: new Date()
    });

    // 다중 접속 방지 (기존 켜져 있는 세션을 모두 오프라인 처리)
    await db.UserSession.update(
        { is_online: false },
        { where: { user_id: user.uuid, is_online: true } }
    );

    // 새로운 유저 세션 발급 및 DB 저장
    const sessionId = crypto.randomUUID();
    await userRepository.createUserSession({
        id: sessionId,
        user_id: user.uuid,
        ip_address: reqInfo.ip,
        is_online: true
    });

    // JWT 토큰(출입증) 생성
    const token = generateToken({
        uuid: user.uuid,
        role: user.role,
        sessionId: sessionId
    });

    return { user, token };
}