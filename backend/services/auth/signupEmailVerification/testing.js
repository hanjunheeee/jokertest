'use strict';

// 가입 이메일 인증 시험 손잡이 파일
// 시험이 해시·코드 만들기를 바로 부름
const { hashCode, hashProof, generateNumericCode, generateProof } = require('./codes');

// 시험용: 해시·만들기 함수
exports.__testables = { hashCode, hashProof, generateNumericCode, generateProof };
