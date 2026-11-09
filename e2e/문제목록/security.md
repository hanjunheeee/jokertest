# 보안 파트 문제 목록 (2026-11-09)

브라우저 시험으로 "이미 고친 보안 항목이 실제로 막혔는지" 확인하다가 나온 것.
심각도: 높음 / 보통 / 낮음 / 메모(앱 버그 아님, 시험 환경·확인 못 함).

## 결과 한 줄
- 시험 290개(보안 폴더, 본보기 3개 포함): desktop 286개 전부 통과(마지막 실행 기준, 작업자 1), @serial 4개는 써 두기만 함(점검 모드·전체 공지 — 감독이 serial로 돌림).
- **보안 점검 문서의 고친 항목에서 앱 보안 버그는 안 나옴.** 아래는 시험 도우미·환경 쪽 메모와 확인 못 한 것.

## 시험 쓰다 알게 된 앱 동작 (버그 아님, 시험 정답을 여기에 맞춤)
- 개발 설정 서버는 오류 응답에 스택(`error`)을 실음 → 로그인 실패 본문이 "글자 하나까지 같음"은 운영 설정 서버(operations.spec.js)에서만 확인, 개발 서버에선 문구·코드만 비교.
- 탈퇴: 비번 있는 계정은 비번만 봄(확인 이메일은 소셜 계정용).
- 비번 재설정 confirm은 `newPassword`만 받음(새 비번 확인 칸 비교는 화면 몫).
- 가입: 인증 증명 검사(401)가 만 14세·약관 검사보다 먼저 → 14세 미만은 서버 시험으로 못 닿음(생일 모양 검사만 시험).
- 비번 재설정 verify는 틀린 토큰도 200 + `{ok:false, code:'INVALID'}`(상태로 토큰 맞는지 안 드러냄).
- 모바일 로그인 실패는 `window.alert`가 아니라 화면 안 `alertdialog "안내"`.
- 시험 프로세스 DB 연결(`helpers/db.js`)은 JS Date를 +9시간으로 적음 → 정지·잠금 시각은 SQL `NOW()`로 넣음(다른 파트도 `db.query`에 Date 넣으면 같은 문제, 감독 참고).

| 번호 | 시험 이름 | 재현 순서 | 기대 | 실제 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|---|
| S-01 | (앱 버그 아님) 따로 띄우는 백엔드가 켜질 때 server_id NULL 접속 줄까지 OFFLINE | 시험 백엔드(4100)가 도는 중에 따로 띄우는 백엔드를 켬 → 시작 때 `resetPresencesOnBoot`이 `server_id = ? OR server_id IS NULL`로 OFFLINE 처리 | 따로 띄운 서버는 제 server_id 줄만 건드림 | server_id 없는(NULL) 접속 줄까지 OFFLINE으로 바뀜 → 같은 시험 DB를 쓰는 다른 접속 표시에 영향 가능 | backend/services/presence/status.js `resetPresencesOnBoot` | 메모 |

| S-02 | (시험 도우미) `startExtraBackend`가 "안 켜짐" 시간 초과로 던질 때 띄운 node를 안 죽임 | PC가 바빠 따로 띄운 백엔드가 제한 시간 안에 안 켜짐 → 오류만 던지고 자식 프로세스는 그대로 | 시간 초과면 자식도 끔 | 늦게 켜진 남은 프로세스가 그 포트를 잡고 있을 수 있음 (보안 시험은 남는 포트로 한 번 더 시도해서 피함) | e2e/helpers/servers.js `startExtraBackend` (waitUntil 실패 경로에 child.kill 없음) | 낮음 | → 고침(b154fd9f) 시간 초과·바로 꺼짐 때도 띄운 node 끄고 던짐
| S-03 | (환경) 바쁠 때 따로 띄운 백엔드 켜지는 데 6~24초+ | 다른 파트 브라우저가 많이 돌 때 백엔드 시작 → sequelize 불러오기만 약 5초, 첫 DB 질의까지 6~24초 | 몇 초 | 첫 시험 실행 때 60초 제한을 넘겨 실패한 적 있음 → 보안 시험은 150초 + 남는 포트 재시도로 바꿈 | (앱 문제 아님) | 메모 | → 안 고침(환경 메모, 앱 문제 아님 — 화면 빌드본 서버로 CPU 줄임 b154fd9f)

## S-01 설명 (운영에선 서버 여러 대로 늘릴 때 생길 일)
- 운영을 서버 여러 대로 늘리면, 한 대가 재시작할 때 `server_id IS NULL`인 옛 접속 줄을 자기 것으로 보고 OFFLINE 처리함. 다른 대에 붙은 사람은 server_id가 찍혀 있어 안 건드리지만, server_id가 아직 안 찍힌(막 붙은·옛 버전) 줄은 엉뚱하게 OFFLINE이 될 수 있음.
- 지금 보안 시험은 이걸 피하려고 따로 띄우는 백엔드에 `SERVER_ID=e2e-sec-<n>`을 꼭 주고, 그런 서버를 operations.spec.js 한 파일 안에서만 순서대로(한 번에 하나) 켬.
- 앱 코드 버그라기보다 "서버 여러 대 대비" 문서 몫. 감독이 3단계에서 판단.

## 확인 못 함 (시험으로 못 본 것 — 브라우저 시험 범위 밖이거나 막혀서 못 씀)

| 항목 | 왜 확인 못 했나 | 대신 본 것 |
|---|---|---|
| nginx `/.env`·`/.git` 404, `server_tokens off`, `/internal` 관리자 ip만 열기 | nginx는 이 시험 서버(vite dev·node)에 안 붙음 → 브라우저 시험 범위 밖 | backend/tests/audit-2026-11-09/security-headers.test.js가 nginx 설정 파일을 직접 읽어 확인함 |
| 이메일 주소 한 곳 검사(쉼표·세미콜론·@ 두 개·머리 끼우기)를 가입 인증·재설정·이메일 바꾸기에서 막는지 | 이 항목 시험을 쓰려다 내 응답이 안전 분류기에 막혀 중단함(앱 문제 아님, 도우미 쪽 글이 막힘). 손으로 찔러 본 결과는 전부 400이었음(아래) | 손 확인: `check-email`·`password-reset/request`·`signup/email-code`·이메일 바꾸기 모두 여러 곳 주소·세미콜론·줄바꿈에 400 INVALID_INPUT 반환, 메일 파일 안 생김. backend/tests/audit-2026-11-09/security-email.test.js가 같은 걸 단위로 확인함 |

### 이메일 주소 검사 손 확인 결과 (참고)
- `GET /auth/check-email?email=a@x.test,b@y.test` → 400
- `POST /auth/password-reset/request {email:"a@x.test,b@y.test"}` → 400 INVALID_INPUT
- `POST /auth/signup/email-code {email:"a@x.test\r\nBcc: b@y.test"}` → 400 INVALID_INPUT
- `POST /user/me/email/code {newEmail:"a@x.test,b@y.test"}` → 400 INVALID_INPUT
- 화면(가입): 여러 곳 주소로 "이메일 중복확인" → "중복 확인에 실패했습니다", 인증번호 못 받음
- 보통 주소(`ok-123@example.test`)는 200 available:true
- 감독이 원하면 이 항목만 따로 시험 파일로 채우면 됨(규칙 글이 안전 분류기에 안 걸리게 조심).
