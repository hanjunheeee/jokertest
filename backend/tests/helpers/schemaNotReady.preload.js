'use strict';

// 시험용 미리 불러오기 파일, index.js의 표 준비 확인을 "안 돌린 마이그레이션 있음"으로 바꿔 끼움
// schemaReadiness.test.js가 node -r 로 index.js 앞에 붙여 씀 (DB 없이 시작 거부 길 확인)
const schemaReadiness = require('../../db/schemaReadiness');

schemaReadiness.ensureSchemaReady = async () => {
    const error = new Error('안 돌린 마이그레이션 1개 [0099-test]');
    error.code = schemaReadiness.SCHEMA_NOT_READY;
    throw error;
};
