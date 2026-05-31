const userRepository = require("../repositories/user.repositories");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");
const crypto = require("crypto")
const db = require("../models");

exports.signup = async (UserData) => {
    const { login_id, email, password, nickname } = UserData;

    const existingUser = await userRepository.findByEmailOrLoginId(email, login_id);
    if(existingUser) {
        throw new Error("이미 사용 중인 이메일이거나 아이디입니다.");
    }

    const password_hash = await hashPassword(password);

    const newUser = await userRepository.createUser({
        login_id,
        email,
        password_hash,
        nickname,
    });

    return newUser;
};

exports.login = async (loginData, reqInfo) => {
    const { email, password } = loginData;

    const user = await userRepository.findByEmail(email);
    if(!user) {
        throw new Error("가입되지 않은 이메일입니다.");
    }

    if(user.locked_untill && user.locked_untill >  new Date()){
        throw new Error("비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.");
    }

    const activeBan = await userRepository.checkActiveBan(user.uuid);
    if(activeBan) {
        const banReason = activeBan.reason || "운영정책 위반";
        throw new Error(`정지된 계정입니다. 사유: ${banReason}`);
    }

    const isMatch = await comparePassword(password, user.password_hash);

    await userRepository.createLoginHistory({
        user_id: user.uuid,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        success: isMatch,
    });

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

    await userRepository.updateUser(user.uuid, {
        failed_login_count: 0,
        locked_until: null,
        last_login_at: new Date()
    });

    await db.UserSession.update(
        { is_online: false },
        { where: { user_id: user.uuid, is_online: true } }
    )

    const sessionId = crypto.randomUUID();
    await userRepository.createUserSession({
        id: sessionId,
        user_id: user.uuid,
        ip_address: reqInfo.ip,
        is_online: true
    });

    const token = generateToken({
        uuid: user.uuid,
        role: user.role,
        sessionId: sessionId
    });

    return { user, token };
}