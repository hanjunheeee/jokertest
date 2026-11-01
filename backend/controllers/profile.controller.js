// 내 프로필 컨트롤러 파일, 프로필 읽기 · 닉네임 바꾸기 · 비번 바꾸기 응답
// routes/user.routes.js가 부름 (프로필·닉네임은 services/user.js, 비번은 services/auth/account)
const userService               = require("../services/user");
const authService               = require("../services/auth/account");
const { validatePassword }      = require("../validations/auth/signup");

// 내 프로필 (계정 행 없으면 404)
exports.getMyProfile = async (req, res, next) => {
    try {
        const data = await userService.getMyProfile(req.user.uuid);
        if (!data) return res.status(404).json({ success: false, message: "유저를 찾을 수 없습니다." });

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
};

// 닉네임 바꾸기, 규칙·중복 실패는 서비스가 준 상태·문구로
exports.updateNickname = async (req, res, next) => {
    try {
        const { nickname } = req.body;
        const result = await userService.changeNickname(req.user.uuid, nickname);
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }

        res.status(200).json({ success: true, message: "닉네임이 변경되었습니다." });
    } catch (error) {
        next(error);
    }
};

// 비번 바꾸기: 두 칸 다 있는지 → 새 비번 규칙 → 현재 비번 맞는지 (바뀌면 접속 세션 끊김)
exports.updatePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "현재 비밀번호와 새 비밀번호를 입력해주세요." });
        }
        // 새 비번은 가입과 같은 규칙 (서비스는 규칙 안 봄)
        const newPasswordResult = validatePassword(newPassword);
        if (!newPasswordResult.ok) {
            return res.status(400).json({ success: false, message: newPasswordResult.message });
        }

        const outcome = await authService.changePassword({ uuid: req.user.uuid, currentPassword, newPassword });

        if (!outcome.ok) {
            return res.status(401).json({ success: false, message: "현재 비밀번호가 올바르지 않습니다." });
        }

        res.status(200).json({ success: true, message: "비밀번호가 변경되었습니다." });
    } catch (error) {
        next(error);
    }
};
