'use strict';

// 관리자 계정 명령 파일, 서버에서 관리자 계정 만들기·비번/OTP 다시 정하기·끄기/켜기·잠금 풀기·목록 (계정 관리 화면 없음)
// 사람이 직접 씀: npm run admin:account -- <명령>, 시험은 함수를 바로 부름 (비번은 화면에 안 보이게 두 번 물음)
const crypto = require('node:crypto');
const path = require('node:path');
const readline = require('node:readline');
const { Op } = require('sequelize');

const { createError } = require('../../utils/appError');
const { hashPassword } = require('../../utils/auth/credentials');
const { totpKeyOf } = require('../config');
const totp = require('../services/core/totp');
const secretBox = require('../services/core/secretBox');
const session = require('../services/core/session');
const loginLock = require('../services/core/loginLock');

const db = () => require('../../repositories/common/db');

const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 12;
// bcrypt는 72바이트 뒤를 안 봄
const PASSWORD_MAX_BYTES = 72;
const OTP_ISSUER = 'MMC 관리자';

const invalid = (message) => createError(message, 400, 'INVALID_INPUT');

const checkPassword = (password) => {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
        throw createError(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`, 400, 'PASSWORD_TOO_SHORT');
    }
    if (Buffer.byteLength(password) > PASSWORD_MAX_BYTES) throw invalid(`비밀번호는 ${PASSWORD_MAX_BYTES}바이트까지예요.`);
};

// 새 OTP 비밀 → { totpSecret, sealed(잠근 것), otpauthUrl }
const newOtp = (loginId) => {
    const key = totpKeyOf();
    if (!key) throw createError('ADMIN_TOTP_KEY(16진수 64자)가 없어요. .env를 먼저 채워 주세요.', 400, 'TOTP_KEY_MISSING');
    const totpSecret = totp.generateSecret();
    return { totpSecret, sealed: secretBox.seal(totpSecret, key), otpauthUrl: totp.otpauthUrl({ secret: totpSecret, account: loginId, issuer: OTP_ISSUER }) };
};

const findAdmin = async (loginId) => {
    const admin = await db().AdminUser.findOne({ where: { login_id: String(loginId ?? '') } });
    if (!admin) throw createError('그 아이디의 관리자가 없어요.', 404, 'ADMIN_NOT_FOUND');
    return admin;
};

// 만들기 → { id, loginId, email, totpSecret, otpauthUrl } (OTP 비밀은 이때 한 번만 보임)
const createAdminAccount = async ({ loginId, email, password, now = new Date() }) => {
    if (!LOGIN_ID_PATTERN.test(String(loginId ?? ''))) throw invalid('아이디는 영문·숫자·._- 3~50자예요.');
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail) || cleanEmail.length > 255) throw invalid('이메일 모양이 아니에요.');
    checkPassword(password);
    const taken = await db().AdminUser.findOne({ where: { [Op.or]: [{ login_id: loginId }, { email: cleanEmail }] } });
    if (taken) throw createError('같은 아이디나 이메일의 관리자가 이미 있어요.', 409, 'ADMIN_EXISTS');
    const otp = newOtp(loginId);
    const id = crypto.randomUUID();
    try {
        await db().AdminUser.create({
            id, login_id: loginId, email: cleanEmail, password_hash: await hashPassword(password), role: 'SUPER',
            totp_secret: otp.sealed, is_active: true, password_changed_at: now, created_at: now, updated_at: now,
        });
    } catch (error) {
        if (error?.name === 'SequelizeUniqueConstraintError') throw createError('같은 아이디나 이메일의 관리자가 이미 있어요.', 409, 'ADMIN_EXISTS');
        throw error;
    }
    return { id, loginId, email: cleanEmail, totpSecret: otp.totpSecret, otpauthUrl: otp.otpauthUrl };
};

// 비번 다시 정하기 (세션 전부 끊음)
const resetAdminPassword = async ({ loginId, password, now = new Date() }) => {
    checkPassword(password);
    const admin = await findAdmin(loginId);
    await admin.update({ password_hash: await hashPassword(password), password_changed_at: now, updated_at: now });
    await session.revokeAllForAdmin(admin.id, { now });
};

// OTP 다시 정하기 → { totpSecret, otpauthUrl } (쓴 칸 번호 비움, 세션 전부 끊음)
const resetAdminOtp = async ({ loginId, now = new Date() }) => {
    const admin = await findAdmin(loginId);
    const otp = newOtp(admin.login_id);
    await admin.update({ totp_secret: otp.sealed, totp_last_step: null, updated_at: now });
    await session.revokeAllForAdmin(admin.id, { now });
    return { totpSecret: otp.totpSecret, otpauthUrl: otp.otpauthUrl };
};

// 끄기·켜기 (끄면 세션 전부 끊음)
const setAdminActive = async ({ loginId, active, now = new Date() }) => {
    const admin = await findAdmin(loginId);
    await admin.update({ is_active: Boolean(active), updated_at: now });
    if (!active) await session.revokeAllForAdmin(admin.id, { now });
};

// 아이디 잠깐 막기 풀기 (IP 막기는 그대로)
const unlockAdmin = async ({ loginId, now = new Date() }) => {
    const admin = await findAdmin(loginId);
    await loginLock.unlockLogin({ loginId: admin.login_id, adminId: admin.id, now });
};

// 목록 (비번 해시·OTP 비밀 없음)
const listAdmins = async () => {
    const rows = await db().AdminUser.findAll({ order: [['created_at', 'ASC']], raw: true });
    return rows.map((row) => ({
        loginId: row.login_id, email: row.email, role: row.role, active: Boolean(row.is_active), lastLoginAt: row.last_login_at,
    }));
};

const HELP = `쓰는 법 (backend 폴더, 운영은 docker compose … exec backend npm run admin:account -- …):
  npm run admin:account -- create --login <아이디> --email <이메일>   만들기 (비번 두 번 물음, OTP 비밀 한 번 보여 줌)
  npm run admin:account -- reset-password --login <아이디>              비번 다시 정하기
  npm run admin:account -- reset-otp --login <아이디>                   OTP 다시 정하기 (새 비밀 보여 줌)
  npm run admin:account -- disable --login <아이디>                     끄기 (로그인 중이면 바로 끊김)
  npm run admin:account -- enable --login <아이디>                      켜기
  npm run admin:account -- unlock --login <아이디>                      로그인 잠깐 막힘 풀기
  npm run admin:account -- list                                          목록`;

// --login a --email b → { login:'a', email:'b' }
const readFlags = (args) => {
    const flags = {};
    for (let i = 0; i < args.length; i += 1) {
        if (args[i].startsWith('--') && args[i + 1] !== undefined) flags[args[i].slice(2)] = args[(i += 1)];
    }
    return flags;
};

// 비번 두 번 물어 같으면 돌려줌, 다르면 null
const askPasswordTwice = async (io) => {
    const first = await io.askHidden('새 비밀번호: ');
    const second = await io.askHidden('한 번 더: ');
    return first === second ? first : null;
};

const printOtp = (io, { totpSecret, otpauthUrl }) => {
    io.print('OTP 앱에 아래 비밀을 넣어 주세요 (지금 한 번만 보여요, 어디에도 저장하지 마세요):');
    io.print(`  비밀: ${totpSecret}`);
    io.print(`  주소: ${otpauthUrl}`);
};

// 명령 하나 실행 → 끝 코드 (0 성공, 1 실패)
const runCommand = async (argv, io) => {
    const [command, ...rest] = argv;
    const { login, email } = readFlags(rest);
    const needsLogin = ['create', 'reset-password', 'reset-otp', 'disable', 'enable', 'unlock'];
    if (!['list', ...needsLogin].includes(command) || (needsLogin.includes(command) && !login)) {
        io.print(HELP);
        return 1;
    }
    try {
        if (command === 'list') {
            for (const admin of await listAdmins()) io.print(`${admin.loginId}\t${admin.email ?? '-'}\t${admin.active ? '켜짐' : '꺼짐'}\t${admin.lastLoginAt ?? '-'}`);
        } else if (command === 'create' || command === 'reset-password') {
            const password = await askPasswordTwice(io);
            if (password === null) {
                io.print('두 비밀번호가 달라요. 처음부터 다시 해 주세요.');
                return 1;
            }
            if (command === 'create') printOtp(io, await createAdminAccount({ loginId: login, email, password }));
            else await resetAdminPassword({ loginId: login, password });
        } else if (command === 'reset-otp') printOtp(io, await resetAdminOtp({ loginId: login }));
        else if (command === 'unlock') await unlockAdmin({ loginId: login });
        else await setAdminActive({ loginId: login, active: command === 'enable' });
        io.print('끝났어요.');
        return 0;
    } catch (error) {
        io.print(error?.code ? `안 됐어요 (${error.code}): ${error.message}` : `안 됐어요: ${error?.name ?? 'Error'}`);
        return 1;
    }
};

// 터미널에서 친 글자를 안 보이게 받기 (터미널 아니면 한 줄 그대로)
const askHidden = (question) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    process.stdout.write(question);
    // 친 글자 화면에 안 찍음
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
        rl.close();
        process.stdout.write('\n');
        resolve(answer);
    });
});

if (require.main === module) {
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
    runCommand(process.argv.slice(2), { askHidden, print: (line) => console.log(line) })
        .then(async (code) => {
            process.exitCode = code;
            await require('../../models').sequelize.close();
        });
}

module.exports = {
    createAdminAccount, resetAdminPassword, resetAdminOtp, setAdminActive, unlockAdmin, listAdmins, runCommand,
};
