'use strict';

const achievementService = require('../services/achievementService');

exports.getMyAchievements = async (req, res, next) => {
    try {
        const achievements = await achievementService.getStatusForUser(req.user.uuid);
        res.status(200).json({ success: true, data: achievements });
    } catch (error) {
        next(error);
    }
};
