const authService = require("../service/auth.service");

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
    const reqInfo = {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
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