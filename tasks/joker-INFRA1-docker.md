---
approval: plan
setup: npm ci --prefix backend
---

# joker-INFRA1 · docker 배포 경로 복구

## 배경 (전수조사 4.3)

배포 경로가 전부 죽어 있다: ① backend/Dockerfile이 커밋 4753634에서 삭제됐는데 docker-compose가 여전히 참조 ② 루트 .env에 JWT_SECRET 부재 (backend/.env에만 있고 컨테이너엔 안 들어감) ③ FRONTEND_URL도 루트 .env 부재 → 컨테이너에서 CORS origin undefined. 현재 유일한 실행 경로는 로컬 npm run dev뿐이다.

## 요구

1. backend/Dockerfile을 재작성한다 (git 히스토리의 삭제본 git show e4c8803:backend/Dockerfile을 참고하되 현재 구조에 맞게).
2. compose의 env 전달을 고친다: JWT_SECRET·FRONTEND_URL이 backend 컨테이너에 도달하게 — 루트 .env로 옮기든 env_file에 backend/.env를 추가하든 계획이 1안 제시. **.env 실값은 커밋하지 않는다** — .env.example 갱신으로 문서화.
3. docker compose config가 오류 없이 통과하고, 필요한 환경변수 목록이 .env.example에 전부 명시된다.

## 성공 조건

- docker compose config 성공 (파싱·참조 오류 없음)
- Dockerfile이 존재하고 backend 빌드 문법이 유효하다 (docker 데몬 없이 검증 가능한 수준까지 — hadolint 또는 문법 검사, 계획이 검증 방법 1안)
- .env.example에 JWT_SECRET·FRONTEND_URL 포함 전 변수 목록
- 로컬 npm run dev 경로 무변경

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 실제 배포·docker 데몬 실행이 필요한 검증 (환경에 docker가 없을 수 있음 — 최종 기동 확인은 사람이 수동)
- CI 구성
- 애플리케이션 코드
