const authService = require("../service/auth.service");
const { getDeviceType } = require("../utils/device");
const { getClientIp } = require("../utils/ip");

exports.signup = async (req, res, next) => {
    try {
    await authService.signup(req.body);
    res.status(201).json({ message: "회원가입이 완료되었습니다." });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

exports.login = async (req, res, next) => {
  try {
    const userAgent = req.headers["user-agent"];
    const reqInfo = {
      ip: getClientIp(req),
      userAgent: userAgent,
      deviceType: getDeviceType(userAgent),
    };

    const { user, token } = await authService.login(req.body, reqInfo);

   
    res.cookie("accessToken", token, {
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production", 
      sameSite: "Lax",
      maxAge: 1000 * 60 * 60 * 24,
    });

    res.status(200).json({ 
      message: "로그인 성공!",
      user: {
        uuid: user.uuid,
        nickname: user.nickname,
        role: user.role
      }
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

exports.logout = async (req, res, next) => {
  try {
    // 1. 프론트에 구워준 쿠키 시원하게 삭제
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
    });

    // 2. 만약 미들웨어를 거쳐서 user 정보와 sessionId가 있다면 DB도 오프라인 처리
    // (이 로직은 서비스로 빼는 게 좋지만, 구조 이해를 위해 적어둡니다)
    // await userRepository.updateSessionStatus(req.user.sessionId, false);

    res.status(200).json({ message: "성공적으로 로그아웃 되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "로그아웃 처리 중 에러가 발생했습니다." });
  }
}