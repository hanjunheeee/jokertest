'use strict';

const db = require('../models');
const { maskEmail } = require('../utils/maskEmail');

const NOT_FOUND_RESULT = Object.freeze({ ok: false, code: 'NOT_FOUND' });

const sameUtcCalendarDay = (a, b) => (
    a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate()
);

const findId = async ({ nickname, birthDate, ipAddress }) => {
    await db.AccountFindRequest.create({
        email: null,
        request_type: 'FIND_ID',
        ip_address: ipAddress,
    }, { logging: false });

    const user = await db.User.findOne({
        where: { nickname },
        attributes: ['nickname', 'email', 'birth_date'],
        raw: true,
        logging: false,
    });

    if (!user) return NOT_FOUND_RESULT;
    if (typeof user.nickname !== 'string' || user.nickname.trim() !== nickname) return NOT_FOUND_RESULT;
    if (!user.birth_date) return NOT_FOUND_RESULT;

    const storedBirthDate = new Date(user.birth_date);
    if (Number.isNaN(storedBirthDate.getTime()) || !sameUtcCalendarDay(storedBirthDate, birthDate)) {
        return NOT_FOUND_RESULT;
    }

    return { ok: true, maskedEmail: maskEmail(user.email) };
};

module.exports = { findId };
