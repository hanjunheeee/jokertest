---
approval: plan
setup: npm ci --prefix backend
---

# joker-DB1 · DB 기동 견고화 (연결 실패 exit 1 + 커넥션 풀 명시)

## 배경 (전수조사 1.2·1.3)

DB 연결 실패 시 서버가 console.error만 남기고 **exit code 0으로 조용히 종료**한다 — pm2·docker restart policy·CI 어느 것도 실패로 인식 못 함. 커넥션 풀은 설정이 없어 라이브러리 기본값(max 5)으로 도는 중.

## 요구

1. `sync(...)` 실패 시(backend/index.js:50-64) 오류를 로그하고 **process.exit(1)** 로 비정상 종료한다. 재시도 로직은 넣지 않는다 (재시작은 프로세스 매니저 몫).
2. Sequelize 커넥션 풀을 명시 설정한다 (backend/models/index.js 또는 config): max는 기본값보다 여유 있게(예: 10~20, 계획이 1안), min·idle·acquire도 명시. 값은 환경변수로 덮어쓸 수 있게 한다.
3. 기동 성공/실패가 로그에서 한 줄로 구분되게 한다 (성공: 포트·DB 연결 확인, 실패: 원인).

## 성공 조건

- 잘못된 DATABASE_URL로 기동하면 exit code 1이다 (자동 테스트 또는 검증 스크립트로 확인)
- 정상 기동 시 풀 설정이 명시값으로 적용된다
- 기존 REST·소켓 동작 회귀 없음

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 게임 로직, docker 구성(별도 슬라이스), 인게임 재연결
