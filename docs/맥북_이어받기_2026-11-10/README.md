# 맥북 이어받기 안내 (2026-11-10)
윈도우 PC에서 하던 큰 점검을 맥북 새 세션이 이어 하기 위한 안내.
맥북 세션은 git에 올라간 것만 봄 → 필요한 것은 전부 이 폴더에 둠.

- 같은 폴더: `프롬프트.md`(새 세션 첫 메시지), `고칠_목록.md`(고칠 것 묶음·조 순서, 다른 에이전트가 씀), `도구/`(이 PC 임시 폴더에서 가져온 도구 사본)
- 실패 원본 기록: `docs/점검_실패목록_2026-11-10.md`

---

## 1. 지금 어디까지 했나

| 순서 | 일 | 상태 |
|---|---|---|
| ① | 관리자 페이지 | 끝남 (손 확인 AD-294·295만 남음) |
| ② | 빈 곳 찾아 채우기 | 끝남 |
| ③ | 코드 나누기 | 끝남 |
| ④ | 거짓말 확인 | 끝남 |
| ⑤ | 점검 1단계 (시험 전부 돌리고 실패 기록) | 끝남 |
| ⑥ | 이상한 순서·여러 명 동시·어려운 시험 124개 추가 | 끝남 |
| ⑦ | 점검 2단계 (실패 전부 한 번에 고치고 관련 시험만 다시) | **남음** |
| ⑧ | 부하 비교 (서버 1대 vs 2대, DB 조이기 전·후) | **남음** |
| ⑨ | 문서 (주간 보고, 시험 목록 문서, 개발자용 최종 Word, ERD·소켓 구조 Word 확인) | **남음** |
| ⑩ | Word 전부 사용자 폰으로 보내고 브랜치 이름만 보고 | **남음** |

### 숫자
| 구분 | 돌린 수 | 결과 |
|---|---|---|
| 단위·DB·Redis 시험 | 13,332 | 실패 3 + eslint 1 |
| 브라우저 시험 | 2,554 | 통과 2,460 · 진짜 실패 83 · 흔들림 11 |
| └ 진짜 실패 83 나눔 | | 서버 1개 기준 41 · 서버 2개 쪽 39(시험 틀의 봇 문제) |
| 새 시험 | 124 (계정 38·서버 여럿 11·방 28·상점 27·게임 한 판 20) | 진짜 버그 의심 13 (계정 2·서버 여럿 6·방 2·상점 3·게임 0) |

- 자세한 것: `docs/점검_실패목록_2026-11-10.md`
- 주의: `backend/tests/cluster/odd-replaceAfterDown.test.js`는 버그 고치기 전까지 `npm test`에서 실패함 (일부러 둠)

### 마지막 커밋 (이 문서 만들 때)
```
898e147d 시험: 이상한 순서·여러 명 동시·어려운 시험 124개 추가 + 점검 실패 목록
a085a220 문서: 배포 전 점검 11/9~10 반영 …
8fc880a4 관리자 페이지: 진행표 전부 완료(손 확인 AD-294·295 남음)
```
- 이 문서 커밋은 그 뒤에 붙음. 맥북에서 `git log --oneline -5`로 확인.

---

## 2. 일하는 규칙

### 역할
- 메인 세션 = 작업 반장만 함: 사용자와 말하기, 일 나눠 맡기기, 진행 확인, 결과 확인, 커밋.
- 코드 고치기·시험 돌리기·문서 쓰기·조사 = 전부 하위 에이전트.

### 하위 에이전트
- 모델은 opus·sonnet만. 띄울 때마다 `model`을 꼭 적음.
- 고르는 법: 간단한 일은 sonnet, sonnet이 못 할 것 같으면 바로 opus → 그 모델 안에서 난이도 따라 추론 강도 low/medium/high.
- sonnet 결과가 모자라면 opus로 넘김.
- 큰 일은 잘게 쪼개 여러 에이전트를 같이 돌림. 두 에이전트가 같은 파일을 안 건드리게 나눔.
- 에이전트를 띄우면 멈춤 감시를 같이 검 (`도구/agent-watchdog.js`).

### 무거운 일
- 시험·빌드는 CPU 보면서, 한 번에 3개까지만 (`도구/heavy.sh`).
- 브라우저 시험은 한 번에 하나 (`도구/with-lock.sh e2e …`). 진짜 DB 시험도 한 번에 하나 (`with-lock.sh testdb …`).

### 시험·고치기 순서
- 시험은 다 만든 뒤 한 번에 돌림. 실패는 모아 적은 뒤 한 번에 고침. 고친 뒤엔 관련 시험만 다시.
- 버그 고치기:
  1. 버그를 보여 주는 시험이 실패하는 것을 먼저 봄
  2. 원인 있는 곳 한 군데만 고침
  3. 고친 것을 잠깐 되돌리면 시험이 다시 실패하는지 봄
- 가드·다시 시도로 덮지 않음 (그 상태가 정상적으로 생길 수 있는 경우만 처리).
- "추천이면 그냥 고침, 너무 애매하면 그대로 둠(기록만)".
- 에이전트마다 중간 보고 안 함 — 다 고치고·다시 시험하고·보고.

### git
- `git add .`·stash·reset 금지.
- 커밋은 `git commit -- <내 경로>`로 내 경로만 (에이전트 여럿이면 남의 스테이징이 섞임).
- force push 금지. main이나 원격 ui 브랜치에 합치지 않음.
- `docs/`·`tasks/`의 삭제 표시(D)는 커밋도 되살리기도 안 함.
- 이미 있는 마이그레이션은 안 고침 (새 번호만, 지금 마지막 0032).
- 커밋 글 끝: `Co-Authored-By: Claude <noreply@anthropic.com>`

### 손대지 않는 파일
- `.claude/launch.json`
- `frontend/tests/domains/game/ingame/store/participantDeparture.test.js`
- `docs/known-issues.md`
- `e2e/.tmp-check`

### 비밀
- `.env` 값을 찍거나 적지 않음. `.env.example`엔 이름과 설명만.
- `joker_realgame` DB는 건드리지 않음.
- 지울 땐 휴지통으로 (영구 삭제 안 함).

### 그 밖
- CI/CD 설정은 `deploy/ci/` 안에서만, 실제로 돌리지 않음.
- 말: 사용자에게 보이는 글은 전부 한국어, 짧게, 쉬운 말.
- 문서·주석은 개조식(~함/~음/~기), 파일 머리 주석 2줄.
- 의도된 것 (버그 아님): 인원 5~10명, 자동(랜덤) 매칭은 일부러 잠가 둠.

---

## 3. 맥북에서 먼저 준비할 것

### 3-1. 저장소·설치
```bash
git fetch
git checkout feature/mobile-ingame-talk
git pull
npm install                          # 저장소 맨 위 (concurrently 등)
(cd backend && npm install)
(cd frontend && npm install)
(cd frontend-mobile && npm install)  # "mmc": "file:.." 로 맨 위를 가리킴 → 맨 위 먼저 설치
(cd e2e && npm install)              # @playwright/test 1.62.1
(cd e2e && npx playwright install chromium webkit)
```
- `package.json` 있는 곳: 맨 위, `backend`, `frontend`, `frontend-mobile`, `e2e` (5곳)
- 브라우저: desktop·mobile·serial·admin 계열 = Chromium(Desktop Chrome·Pixel 7 흉내), mobile-safari = WebKit(iPhone 13 흉내)
- `e2e/README.md` 말: 윈도우에선 이미 있던 chromium을 씀 → 맥에선 위 install 필요할 것 (확인 못 함)
- `e2e`의 Redis 도우미는 `backend/node_modules/ioredis`를 빌려 씀 → backend 설치가 먼저

### 3-2. git에 없어서 손으로 옮길 것
> 아래 것들은 `맥북_동봉_2026-11-10.tar.gz` 하나로 묶어 사용자에게 따로 보냈음(git에는 없음).
> 묶음 안 `읽어주세요.md`대로 풀면 됨. 비밀값이 들어 있으니 git에 올리지 않음.

| 무엇 | 어디 | 비고 |
|---|---|---|
| `.env` | 맨 위 | 본보기 `.env.example`. docker compose(DB 비번 등)가 읽음 |
| `.env` | `backend/` | 본보기 `backend/.env.example` |
| `.env.testdb` | `backend/` | 진짜 DB 시험 주소. `npm run test:db:setup`이 새로 만들어 줌 → 옮기지 않아도 됨 |
| `.env.test` | `backend/` | **git에 있음** (옮길 필요 없음) |
| `.env.e2e` | `e2e/` | 처음 `npm run db:setup`이 무작위로 만듦. 토스 시험 키만 backend/.env에서 옮겨 넣음 (`e2e/README.md`) |
| `.env` | `frontend/`, `frontend-mobile/` | 본보기 각 폴더 `.env.example` |
| `docs/known-issues.md` | | git 추적 안 됨. 손대지 않는 파일이지만 참고용으로 옮김 |
| `reports/` 폴더 | | `.gitignore`에 있음. 전체 약 3.4GB → 아래 필요한 것만 옮겨도 됨 |
| 스킬 | `~/.claude/skills/` | supervise·test-run·bug-fix·easy-doc·report·deploy-check·git-tidy·comment·records 등. 이름만 적음, 내용은 저장소에 없음 |

- 값은 이 문서에 안 적음. 파일 통째로 안전한 길(USB·개인 클라우드 등)로 옮김.

#### reports에서 남은 문서 일에 필요한 것
| 파일·폴더 | 크기 | 쓰는 곳 |
|---|---|---|
| `reports/최종보고_2026-11-10/원고.md` | 31KB | ⑨ 개발자용 최종 Word 원고 |
| `reports/DB_ERD_2026-11-10.docx` | 2.4MB | ⑨ ERD Word 확인 |
| `reports/DB_ERD_2026-11-10_src/` | 약 3MB (build_docx.py, build_erd.cjs, data/, erd/ 그림, shot.sh) | ERD Word 다시 만들 때 |
| `reports/소켓구조_2026-11-10/` | 약 4.5MB | ⑨ 소켓 구조 확인 |
| └ `백엔드_0_전체구조와흐름_2026-11-10.html/.json/.pdf` | 123KB / 17KB / 498KB | |
| └ `백엔드_2_socket_2026-11-10.html/.json/.pdf` | 900KB / 90KB / 2.9MB | |

- 그 밖 `reports/`: `최종문서_2026-11-01·02·07·09`, `전수조사_2026-11-09`, `운영받침_2026-11-09`, `브라우저확인_2026-11-09`, `DB_점검_ERD_2026-11-01*`, `Joker_리팩터링_보고서*`, `mobile-plan`, `mobile-shots`, `_doc-work`, `_pdf-build`, `learning` — 지난 문서. 필요하면 옮김.

### 3-3. DB·Redis
- 이 PC에서 쓰던 것: docker 컨테이너 `jokertest-db-1`(MySQL 8.4), `mmc-redis-test`(Redis, 시험용)

| 할 일 | 명령 | 근거 |
|---|---|---|
| 개발 DB 켜기 | `docker compose up -d db` (맨 위, 맨 위 `.env` 필요) | `docker-compose.yml` |
| 컨테이너 이름 | compose가 `<폴더 이름>-db-1`로 만듦 → 저장소 폴더 이름이 `jokertest`가 아니면 이름이 달라짐 | |
| └ 이름이 다를 때 | 진짜 DB 시험: `TEST_DB_CONTAINER=<이름>`, 브라우저 시험: `E2E_DB_CONTAINER=<이름>` | `backend/scripts/setup-test-db.js`, `e2e/scripts/setup-db.js` |
| 진짜 DB 시험 DB 만들기 | `cd backend && npm run test:db:setup` (시험 전용 DB·계정 새로, `.env.testdb`에 주소 씀) | |
| 브라우저 시험 DB 만들기 | `cd e2e && npm run db:setup` (시험 DB·마이그레이션·시험 상품, 다시 돌려도 됨) / 새로: `npm run db:reset` | `e2e/README.md` |
| 시험 Redis | `cd backend && npm run test:redis:setup` (컨테이너 `mmc-redis-test` 없으면 만들고 켬) | `backend/scripts/setup-test-redis.js` |
| 개발 DB 마이그레이션 | `node backend/scripts/migrate-db.js status` / `migrate` | `backend/scripts/migrate-db.js` |
| 서버 여럿 compose (운영 꼴) | `docker compose -f docker-compose.yml -f docker-compose.nodes.yml up -d` | `docker-compose.nodes.yml` 머리 (`node deploy/scripts/gen-nodes.js`로 만듦) |

- 개발 DB에 처음부터 데이터 넣는 법: 확인 못 함 (`backend/scripts/seed-dev-testers.js` 있음, 쓰는 법 안 봄)
- 맥북 Docker Desktop 설치 여부: 확인 못 함

### 3-4. 시험 명령 모음
| 무엇 | 명령 (폴더) |
|---|---|
| 서버 단위 시험 | `npm test` (backend) — `.env.test` 씀 |
| 서버 게임 핵심만 | `npm run test:game-core` (backend 또는 맨 위) |
| 진짜 DB 시험 | `npm run test:with-db -- <파일>` (backend, 한 번에 하나) |
| 진짜 Redis 시험 | `npm run test:with-redis` (backend, `tests/cluster` 통합 시험) |
| 서버 eslint | `npm run lint` (backend) |
| 화면 시험 | `npm test` (frontend), `npm test` (frontend-mobile) |
| 화면 빌드 | `npm run build`, 관리자 `npm run build:admin` (frontend) / `npm run build` (frontend-mobile) |
| 브라우저 전부 | `npx playwright test` (e2e) |
| 프로젝트 하나 | `npx playwright test --project=<desktop·mobile·mobile-safari·serial·admin·admin-phone·admin-phone-serial>` |
| 사파리만 | `npm run test:safari` |
| 서버 꺼짐 등 serial | `npm run test:shutdown` (= `--project=serial --no-deps`) |
| 관리자만 | `npx playwright test --project=admin --project=admin-phone` |
| 서버 2개 | `E2E_NODES=2 npx playwright test …` (`multinode/` 폴더는 이때만 돎, Redis 필요: 기본 `E2E_REDIS_URL` 없으면 시험 Redis 씀) |
| 파일 하나만 | `npx playwright test --project=<이름> --no-deps <파일 경로>` (serial은 `--no-deps` 꼭) |
| 동시 수 | `E2E_WORKERS=<수>` (기본 6) |
| 결과 보기 | `npm run report` (e2e) |
| 부하 시험 | `node scripts/loadtest/run.js --games 2 --players 5` (backend) — 쓰는 법 `docs/부하시험.md` |

### 3-5. 윈도우와 다른 점
- 줄 끝: `.gitattributes`가 `eol=lf`로 맞춤 → 윈도우에서 보던 CRLF 경고는 맥에선 거의 안 날 것 (확인 못 함)
- 막힌 포트: 윈도우는 listen(0)이 브라우저가 막는 포트를 받아 흔들림 → `backend/tests/helpers/fetchablePort.js`를 씀. 맥에서도 그대로 써도 됨
- 시간대: 브라우저 시험 DB 시각은 UTC (`e2e/README.md` "시각은 UTC"). 맥 시간대가 KST면 같은 주의
- WebKit: 윈도우 WebKit은 진짜 아이폰과 달랐음. 맥 WebKit 결과는 조금 다를 수 있음 → mobile-safari 흔들림은 다시 봐야 함
- CPU 재는 법: 도구가 powershell을 씀 → 맥에선 바꿔야 함 (아래 4)

---

## 4. 도구 사본 (`도구/`)
- 이 PC 임시 폴더에서 그대로 복사. 비밀값·개인 정보 없음 확인함.
- **맥에서 돌려 보지 않음.** 사본은 PC 사용자 이름이 든 경로를 `<임시 폴더>`·`<저장소>`로 가려 둠 → 그대로는 안 돎. 맥에서 쓰려면 이 둘을 맥 경로로 바꾸고 아래 표대로 고침 (줄 번호는 맨 위 본보기 주석 한 줄이 늘어난 뒤 기준).

| 파일 | 하는 일·쓰는 법 |
|---|---|
| `with-lock.sh` | 공용 자원 잠금. `bash with-lock.sh <testdb\|e2e> <명령…>` — 한 번에 한 에이전트만 |
| `heavy.sh` | 무거운 일 3개까지 + CPU 90% 넘으면 기다림. `AGENT_NAME=<이름> bash heavy.sh <명령…>` |
| `agent-watchdog.js` | 결과 폴더가 N분 안 바뀌면 "멈춤 의심" 한 줄 찍고 끝남. `node agent-watchdog.js <분> <폴더…>` (백그라운드로 걸어 둠) |
| `cpu-watch.ps1` | 윈도우용 CPU·메모리 감시 (30초마다, 높으면 알림). 맥에선 못 씀 |
| `check-common.md` | 점검 1단계 에이전트 공통 지시문 본보기 |
| `odd/common.md` | 이상한 순서·동시 시험 에이전트 공통 지시문 본보기 |
| `br/all.sh` | 브라우저 시험 전체를 프로젝트별 단계로 차례로 돌림 (`e2e` 잠금 안에서) |
| `br/run-phase.sh` | 한 단계 돌리고 실패 파일만 한 번 다시. `bash run-phase.sh <이름> <서버 수> <playwright 인자…>` |
| `br/failed.js` | run-phase가 부름. 결과 JSON에서 실패 시험 뽑기 (`--detail`이면 자세히) |

### 맥에서 바꿔야 할 곳
| 파일 | 줄 | 무엇 |
|---|---|---|
| `with-lock.sh` | 6 | 잠금 폴더 `<임시 폴더>` → 맥 경로(예: 세션 임시 폴더)로 |
| `heavy.sh` | 5 | 잠금 폴더 `<임시 폴더>` → 맥 경로로 |
| `heavy.sh` | 7 | CPU를 `powershell … Win32_Processor`로 잼 → 맥은 `top -l 1`·`ps -A -o %cpu` 등으로 |
| `br/all.sh` | 4 | `<임시 폴더>/br` → 맥 경로로 |
| `br/run-phase.sh` | 6 | 결과 폴더 `<임시 폴더>/br` → 맥 경로로 |
| `br/run-phase.sh` | 7 | `cd <저장소>/e2e` → `<저장소>`를 맥 저장소 경로로 |
| `br/run-phase.sh` | 8 | CPU를 powershell로 잼 → 맥 명령으로 |
| `br/failed.js` | 31 | 다시 돌리기 전 CPU를 powershell로 잼 → 맥 명령으로 (못 재면 0으로 보고 그냥 지나감) |
| `cpu-watch.ps1` | 전체 | 윈도우 전용 (`Get-CimInstance`). 맥은 새로 짜거나 안 씀 |
| `check-common.md`, `odd/common.md` | 여러 줄 | `<임시 폴더>`·`<저장소>`·`~/.claude/skills` 경로와 powershell CPU 명령이 적혀 있음 → 본보기로만 보고 맥 경로로 바꿔 씀 |
| `agent-watchdog.js` | — | 바꿀 곳 없음 (Node만 씀) |

- `with-lock.sh`의 `find -mmin`·`mkdir` 잠금은 맥 기본 명령으로도 될 것 (확인 못 함)

---

## 5. 남은 일 순서

### ⑦ 점검 2단계 — 실패 전부 고치기
- 재료: `docs/맥북_이어받기_2026-11-10/고칠_목록.md`, `docs/점검_실패목록_2026-11-10.md`
- 하는 법:
  - `고칠_목록.md` 맨 아래 "같이 돌릴 조" 순서대로 에이전트를 띄움 (조 안은 같이, 조끼리는 차례로)
  - 묶음마다 추천 모델대로. 같은 파일 겹치면 나눔
  - 각 에이전트: 2장 "버그 고치기" 순서 지킴 → 그 묶음의 관련 시험만 다시
  - 서버 2개 쪽 실패 39개는 시험 틀의 봇 문제 → 시험 쪽 고침인지 `고칠_목록.md` 보고 판단
- 끝난 모습:
  - 묶음마다 고침 또는 "애매해서 둠(기록)" 중 하나
  - `odd-replaceAfterDown.test.js` 포함 관련 시험 다시 돌려 통과
  - `docs/점검_실패목록_2026-11-10.md`에 고친 결과 적음, 내 경로만 커밋

### ⑧ 부하 비교
- 재료: `backend/scripts/loadtest/`, `docs/부하시험.md`, 서버 여럿 compose(`docker-compose.nodes.yml`)
- 비교 4가지: 서버 1대 / 2대 × DB 조이기 전 / 후
- "DB 조이기" 뜻 확인 못 함 — 저장소 `docs/` 아래 .md(`부하시험.md` 포함)에 "조이기·조임" 말이 없음 → 시작 전에 사용자에게 물음
- 끝난 모습: 같은 조건 숫자 표(응답 시간·오류율·처리량), 짧은 해석, 기록은 `docs/` 안에

### ⑨ 문서
| 문서 | 재료 | 끝난 모습 |
|---|---|---|
| 주간 보고 | 이 README 1장, 점검 결과, 부하 결과 | Word, report 스킬 7단 양식 |
| 시험 목록 문서 | 시험 파일 전부 | `e2e/시험목록_2026-11-10.md` + 같은 내용 JSON (아직 없음) |
| 개발자용 최종 Word | `reports/최종보고_2026-11-10/원고.md` | 원고 고친 내용 반영해 Word |
| ERD Word 확인 | `reports/DB_ERD_2026-11-10.docx`, `_src/` | 새 마이그레이션 생기면 다시 만듦, 아니면 확인만 |
| 소켓 구조 확인 | `reports/소켓구조_2026-11-10/` | ⑦에서 소켓 바뀐 것 반영됐는지 확인, Word 필요 여부 확인 |

- 문서는 easy-doc·report 스킬 규칙 (맥에 스킬을 옮겼을 때)

### ⑩ 보내기·보고
- Word 전부 사용자 폰으로 보냄 (보내는 길은 사용자에게 확인)
- 사용자에게는 브랜치 이름만 보고
