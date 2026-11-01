const userService               = require("../services/user");
const authService               = require("../services/auth/account");
const { validatePassword }      = require("../validation/signupValidation");

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

exports.updatePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "현재 비밀번호와 새 비밀번호를 입력해주세요." });
        }
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
