// 부하 시험 계정 파일, 로컬 DB에 시험 계정 만들고 지우기 + 실서버용 계정 목록 파일 읽기
// run.js가 부름: 로컬이면 만들고 끝나면 지움, 로컬 아니면 파일에서만 받음 (스크립트가 실서버 계정을 안 만듦)
const fs     = require("fs");
const crypto = require("crypto");

// 시험 계정 이메일 모양 (지울 때 이 모양만 지움)
const EMAIL_PREFIX = "loadtest+";
const EMAIL_DOMAIN = "@example.test";
const EMAIL_LIKE = `${EMAIL_PREFIX}%${EMAIL_DOMAIN}`;
const emailOf = (index) => `${EMAIL_PREFIX}${index}${EMAIL_DOMAIN}`;

// 실행 때마다 새 비번 (화면·파일에 안 남김)
const randomPassword = () => `Lt!${crypto.randomBytes(18).toString("base64url")}`;

// 계정 목록 파일: [{ "email": "...", "password": "..." }, ...]
function loadAccountsFile(filePath) {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("계정 목록 파일은 [{email,password}, ...] 배열이어야 함");
    return raw.map((item, i) => {
        if (typeof item?.email !== "string" || typeof item?.password !== "string") {
            throw new Error(`계정 목록 ${i}번째 줄에 email·password가 없음`);
        }
        return { email: item.email, password: item.password };
    });
}

// 사용자 표를 가리키는 외래키 중 DB가 알아서 안 지우는 것(CASCADE·SET NULL 아님)만 골라 먼저 지움
// 시험 계정끼리만 한 판이라 그 판 기록도 시험 계정 것뿐
async function deleteRowsDeep(sequelize, table, column, values, depth = 0) {
    if (values.length === 0 || depth > 6) return;
    const [refs] = await sequelize.query(
        `SELECT k.TABLE_NAME AS childTable, k.COLUMN_NAME AS childColumn, k.REFERENCED_COLUMN_NAME AS parentColumn
           FROM information_schema.KEY_COLUMN_USAGE k
           JOIN information_schema.REFERENTIAL_CONSTRAINTS r
             ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
          WHERE k.REFERENCED_TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = ?
            AND r.DELETE_RULE NOT IN ('CASCADE', 'SET NULL')`,
        { replacements: [table] },
    );
    for (const ref of refs) {
        if (ref.childTable === table) continue;
        const [parents] = await sequelize.query(
            `SELECT \`${ref.parentColumn}\` AS v FROM \`${table}\` WHERE \`${column}\` IN (?)`,
            { replacements: [values] },
        );
        const parentValues = parents.map((row) => row.v).filter((v) => v !== null);
        if (parentValues.length === 0) continue;
        const [childRows] = await sequelize.query(
            `SELECT \`${ref.childColumn}\` AS v FROM \`${ref.childTable}\` WHERE \`${ref.childColumn}\` IN (?)`,
            { replacements: [parentValues] },
        );
        if (childRows.length === 0) continue;
        await deleteRowsDeep(sequelize, ref.childTable, ref.childColumn, parentValues, depth + 1);
    }
    await sequelize.query(`DELETE FROM \`${table}\` WHERE \`${column}\` IN (?)`, { replacements: [values] });
}

// 시험 계정 전부 지우기 (지난번에 덜 지운 것까지), 지운 수 돌려줌
async function deleteLocalAccounts(db) {
    const [rows] = await db.sequelize.query("SELECT uuid FROM users WHERE email LIKE ?", { replacements: [EMAIL_LIKE] });
    const uuids = rows.map((row) => row.uuid);
    await deleteRowsDeep(db.sequelize, "users", "uuid", uuids);
    return uuids.length;
}

// 시험 계정 count개 만들기: 같은 무작위 비번 하나 (해시 한 번), 이메일 인증 끝난 상태
async function createLocalAccounts(db, count) {
    await deleteLocalAccounts(db);
    const password = randomPassword();
    const { hashPassword } = require("../../utils/auth/credentials");
    const passwordHash = await hashPassword(password);
    const runId = crypto.randomBytes(3).toString("hex");
    const rows = Array.from({ length: count }, (_, i) => ({
        email: emailOf(i + 1),
        nickname: `lt${runId}_${i + 1}`,
        password_hash: passwordHash,
        email_verified: true,
        has_local_password: true,
    }));
    await db.User.bulkCreate(rows);
    // 가입과 같게 기본 사진·테두리·이모티콘 지급 (안 하면 첫 방 만들기·입장이 지급 25건을 떠안아 실제보다 느리게 잼)
    const economyService = require("../../services/economy");
    const created = await db.User.findAll({ where: { email: rows.map((row) => row.email) }, attributes: ["uuid"] });
    await Promise.all(created.map((user) => economyService.ensureDefaultEntitlements(user.uuid, db)));
    return rows.map((row) => ({ email: row.email, password }));
}

module.exports = { EMAIL_LIKE, emailOf, randomPassword, loadAccountsFile, createLocalAccounts, deleteLocalAccounts, deleteRowsDeep };
