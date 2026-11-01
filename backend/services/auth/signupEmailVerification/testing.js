'use strict';

// 가입 이메일 인증 시험 손잡이 파일
// 입구가 __testables로 내보냄, 지금 부르는 시험 없음
const { hashCode, hashProof, generateNumericCode, generateProof } = require('./codes');

// 시험용: 해시·만들기 함수
exports.__testables = { hashCode, hashProof, generateNumericCode, generateProof };
