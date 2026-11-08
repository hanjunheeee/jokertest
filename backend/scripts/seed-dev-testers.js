#!/usr/bin/env node
'use strict';

// 개발용 시험 계정 tester1~tester4 만들기, 실제 가입과 같게 계정·통계·기본 지급·약관 동의까지 넣음
// 개발자가 직접 돌림 (backend 폴더에서 node scripts/seed-dev-testers.js), 운영(NODE_ENV=production)에선 거부
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_PATH = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: ENV_PATH, quiet: true });

// 시험 계정 모양 (이메일 인증 끝남, 생일 2000-01-01 = 만 14세 넘음)
const TESTERS = Object.freeze([1, 2, 3, 4].map((n) => ({ email: `tester${n}@example.test`, nickname: `tester${n}` })));
const BIRTH_DATE = new Date(Date.UTC(2000, 0, 1));

// 비번: .env의 DEV_TESTER_PASSWORD, 없으면 무작위로 만들어 .env에 붙임 (화면·로그에 값 안 찍음)
const loadPassword = () => {
    const current = process.env.DEV_TESTER_PASSWORD;
    if (typeof current === 'string' && current.length >= 8) return { password: current, created: false };
    const password = `Dt!${crypto.randomBytes(15).toString('base64url')}`;
    const text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    // 빈 값 줄이 있으면 그 줄을 바꾸고, 없으면 끝에 붙임
    const next = /^DEV_TESTER_PASSWORD=.*$/m.test(text)
        ? text.replace(/^DEV_TESTER_PASSWORD=.*$/m, `DEV_TESTER_PASSWORD=${password}`)
        : `${text}${text && !text.endsWith('\n') ? '\n' : ''}DEV_TESTER_PASSWORD=${password}\n`;
    fs.writeFileSync(ENV_PATH, next);
    return { password, created: true };
};

const seed = async () => {
    const db = require('../models');
    const userRepository = require('../repositories/user');
    const { hashPassword } = require('../utils/auth/credentials');
    const economyService = require('../services/economy');
    const termsService = require('../services/auth/terms');
    const termsRepository = require('../repositories/auth/terms');

    const { password, created } = loadPassword();
    const passwordHash = await hashPassword(password);
    // 종류마다 가장 늦은 약관에 동의한 것으로 (시행 전 버전도 포함, 시행일 지나도 재동의 창 안 뜨게)
    const FAR_FUTURE = new Date(Date.UTC(9999, 0, 1));
    const latestTerms = termsService.pickCurrentVersions(await termsRepository.findAllVersions(), FAR_FUTURE);
    const agreedIds = latestTerms.map((terms) => Number(terms.id));

    const results = [];
    for (const tester of TESTERS) {
        const existing = await userRepository.findByEmail(tester.email);
        if (existing) {
            // 이미 있으면 빠진 약관 동의만 채움
            const agreed = new Set((await termsRepository.findAgreedVersionIds(existing.uuid)).map(Number));
            const missing = agreedIds.filter((id) => !agreed.has(id));
            await termsService.recordAgreements(existing.uuid, missing);
            results.push(`${tester.nickname}: 이미 있음 (약관 동의 ${missing.length}개 채움)`);
            continue;
        }
        // 가입 서비스와 같은 순서: 계정 → 통계 → 기본 지급 → 약관 동의 (한 트랜잭션)
        await userRepository.withTransaction(async (transaction) => {
            const user = await userRepository.createUser({
                email: tester.email,
                password_hash: passwordHash,
                nickname: tester.nickname,
                birth_date: BIRTH_DATE,
                email_verified: true,
            }, { transaction });
            await userRepository.createUserStats(user.uuid, { transaction });
            await economyService.ensureDefaultEntitlements(user.uuid, db, { transaction });
            await termsService.recordAgreements(user.uuid, agreedIds, { transaction });
        });
        results.push(`${tester.nickname}: 새로 만듦`);
    }
    return { results, created, termsCount: agreedIds.length, close: () => db.sequelize.close() };
};

if (require.main === module) {
    if (process.env.NODE_ENV === 'production') {
        console.error('운영(NODE_ENV=production)에서는 시험 계정을 만들지 않음');
        process.exit(1);
    }
    seed()
        .then(async ({ results, created, termsCount, close }) => {
            results.forEach((line) => console.log(line));
            console.log(`동의 기준 약관 ${termsCount}개 (종류마다 가장 늦은 버전)`);
            console.log(created ? '비번은 새로 만들어 .env의 DEV_TESTER_PASSWORD에 넣음' : '비번은 .env의 DEV_TESTER_PASSWORD 씀');
            await close();
        })
        .catch((error) => {
            console.error('시험 계정 만들기 실패:', error.message);
            process.exit(1);
        });
}

module.exports = { TESTERS, seed };
