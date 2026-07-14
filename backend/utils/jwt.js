// JWT(JSON Web Token)를 만들고 검증할 때 사용하는 라이브러리입니다.
const jwt = require("jsonwebtoken");

// 로그인 성공 후 클라이언트에게 줄 JWT 토큰을 생성합니다.
// payload에는 토큰 안에 담고 싶은 사용자 정보(id, nickname 등)를 넣습니다.
exports.generateToken = (payload) => {
    // jwt.sign(담을 데이터, 비밀키, 옵션) 형태로 토큰을 만듭니다.
    // JWT_SECRET이 없으면 여기서 조용히 기본값으로 대체하지 않고 바로 에러를 냅니다 —
    // auth.middleware.js의 검증 쪽엔 기본값이 없어서, 여기만 대체하면 로그인은 되는데
    // 이후 모든 인증 요청이 401 나는 혼란스러운 상태가 생기기 때문입니다.
    return jwt.sign(payload, process.env.JWT_SECRET, {
        // 토큰 유효시간입니다. "1d"는 1일 동안 유효하다는 뜻입니다.
        expiresIn: "1d",
    });
};
