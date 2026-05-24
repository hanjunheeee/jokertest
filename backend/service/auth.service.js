const userRepository = require("../repositories/user.repositories");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");

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

    const isMatch = await comparePassword(password, user.password_hash);

    await userRepository.createLoginHistory({
        user_id: user.uuid,
        ip_address: reqInfo.ip,
        user_agent: reqInfo.userAgent,
        success: isMatch,
    });

    if(!isMatch) {
        throw new Error("비밀번호가 일치하지 않습니다.");
    }

    const token = generateToken({
        uuid: user.uuid,
        role: user.role,
    });

    return { user, token };
}