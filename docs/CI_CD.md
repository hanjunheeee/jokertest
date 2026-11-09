# CI/CD 설정

- 지금 원격(hanjunheeee/jokertest)에선 **안 돎**: 설정 파일을 `.github/`가 아니라 `deploy/ci/`에 둠 (push해도 Actions 안 켜짐)
- 새 저장소로 옮길 때 아래 '1. 켜는 법'대로 한 군데로 복사하면 켜짐
- 할 일은 전부 `deploy/ci/scripts/*.sh`에 → GitHub Actions·GitLab CI 둘 다 같은 스크립트를 부름 (둘이 따로 놀지 않게)
- 자동 배포 없음: 손으로 또는 `v*` 태그 때만, production은 승인 받고

## 0. 파일

| 파일 | 하는 일 |
| --- | --- |
| `deploy/ci/github-actions/ci.yml` | GitHub CI (PR·push·하루 한 번·손으로) |
| `deploy/ci/github-actions/deploy.yml` | GitHub CD (손으로·`v*` 태그, 배포·되돌리기·상태) |
| `deploy/ci/gitlab-ci.yml` | GitLab CI/CD (같은 일, 같은 스크립트) |
| `deploy/ci/gitleaks.toml` | 비밀값 검사 허용 목록 (시험 키 모양·예시 값·가짜 키 든 시험 파일) |
| `deploy/ci/compose.registry.yml` | 배포 이미지 이름 겹쳐 쓰기 (`IMAGE_REGISTRY/mmc-backend:IMAGE_TAG`) |
| `deploy/ci/scripts/backend.sh` 외 6개 | CI 일 하나씩 (아래 표) |
| `deploy/ci/scripts/deploy/*.sh` | 배포: `build-push`(이미지)·`ship`(SSH로 보냄)·`remote`(서버 안 순서)·`smoke`(바깥 확인) |
| `deploy/ci/scripts/lib/*` | 공통 조각·시험 DB 연결(앱 DB 준비 스크립트의 `docker exec … mysql`을 CI MySQL로 돌림) |

## 1. 켜는 법 (새 저장소)

- **GitHub**: `mkdir -p .github/workflows && cp deploy/ci/github-actions/*.yml .github/workflows/` → 커밋·push
- **GitLab**: `cp deploy/ci/gitlab-ci.yml .gitlab-ci.yml` → 커밋·push
- 그다음 '4. 비밀값'을 넣고, production 승인('5. 승인')을 걸기
- 배지(README 맨 위, GitHub): `![CI](https://github.com/<계정>/<저장소>/actions/workflows/ci.yml/badge.svg)` · GitLab: `![pipeline](https://gitlab.com/<그룹>/<저장소>/badges/main/pipeline.svg)`

## 2. CI — 언제·무엇

| 일 | 언제 | 무엇 (스크립트) |
| --- | --- | --- |
| backend | PR·push | `npm ci` → eslint → `npm test`(DB 없는 기본) → `test:game-core` (`backend.sh`) |
| backend-db | PR·push | MySQL 8.4 서비스 → `test:db:setup`(시험 전용 DB·계정) → `test:with-db` (`backend-db.sh`) |
| frontend | PR·push | `npm ci` → eslint → `npm test` → 빌드(`VITE_API_BASE_URL=http://api.ci.test`) (`frontend.sh`) |
| frontend-mobile | PR·push | 두 폴더 `npm ci`(데스크톱 src·public 같이 씀) → eslint → `npm test` → 빌드 (`frontend-mobile.sh`) |
| e2e quick | PR만 | MySQL + e2e 서버 셋(백엔드 4100·빌드본 화면 5273·5274), desktop 프로젝트, `tests/auth·lobby·room·security`, `@game`·`@serial`·`@shutdown` 뺌, 작업자 2 (`e2e.sh quick`) |
| e2e full | 하루 한 번(03:00 KST)·손으로 | 전부: desktop·mobile·mobile-safari(WebKit)·serial (`e2e.sh full`) |
| docker | PR·push | `docker compose build`(push 안 함, 프로젝트 이름 `mmc-ci`) → 화면 이미지 안 `nginx -t` (`docker-build.sh`) |
| audit | PR·push | 폴더 넷 `npm audit --audit-level=high` — 2026-11-09 높음 0이라 **하나라도 생기면 실패** (`audit.sh`) |
| secrets | PR·push | gitleaks: 지금 파일 전체 + 이번 커밋 범위만 (`secrets-scan.sh`) |

- 같은 브랜치·PR에 새 push → 이전 실행 취소 (GitHub `concurrency`, GitLab `auto_cancel` + `interruptible`)
- Node는 `.nvmrc`(22), npm 캐시 씀
- e2e 실패 → Playwright 보고서(`e2e/reports/`)·trace·사진(`e2e/test-results/`)·서버 로그를 결과물(artifact)로 14일
- GitLab 일정: Build → Pipeline schedules에서 `0 3 * * *`(Asia/Seoul) 만들기 → e2e full만 돎
- 비밀값 검사가 기록 전체가 아니라 범위만 보는 이유: 옛 커밋에 남은 값(git 정리 할 일)은 기록을 다시 쓰기 전까지 늘 걸림 → 새로 들어오는 것만 막음. 처음 돌릴 때 가짜 값이 걸리면 그 모양만 `gitleaks.toml`에 넣기(진짜 값 넣지 않기)
- 시험 DB root 비번 `ci-root-test-only`는 CI 안 서비스 컨테이너에서만 쓰는 값 (비밀 아님)

### 로컬에서 같은 스크립트 돌리기 (Git Bash·리눅스)

```bash
CI_SKIP_INSTALL=1 bash deploy/ci/scripts/backend.sh          # node_modules 있으면 npm ci 건너뜀
CI_SKIP_INSTALL=1 CI_BUILD_OUT_DIR=/tmp/ci-out bash deploy/ci/scripts/frontend.sh   # 빌드를 dist 말고 딴 데로
bash deploy/ci/scripts/audit.sh
# DB 시험: 버리는 MySQL 하나 띄워서 (개발 DB·.env.testdb 안 건드리려면 저장소 사본에서)
docker run -d --name mmc-ci-mysql-local -e MYSQL_ROOT_PASSWORD=ci-root-test-only -p 127.0.0.1:3407:3306 mysql:8.4
MYSQL_ROOT_PASSWORD=ci-root-test-only CI_DB_PORT=3407 CI_DB_CONTAINER=mmc-ci-mysql-local bash deploy/ci/scripts/backend-db.sh
```

- 윈도우에선 `CI_DB_CONTAINER`(진짜 docker exec) 방식만 됨 (가로채기 스크립트는 리눅스 러너용)
- `backend-db.sh`·`e2e.sh`는 `backend/.env.testdb`·`e2e/.env.e2e`를 새로 씀 → 개발 PC에서 그대로 돌리면 쓰던 시험 DB 주소가 바뀜

## 3. CD — 배포 순서

손으로(GitHub: Actions → Deploy → Run workflow, 환경 staging/production 고르기 · GitLab: Run pipeline에 `DEPLOY_ENV`) 또는 `v*` 태그 push(production).

1. **이미지 빌드·태그**: backend·frontend를 커밋 해시 12자 태그로 빌드 (`VITE_*`는 환경별 값으로 빌드 때 박음)
2. **push**: `IMAGE_REGISTRY`로 (GHCR `ghcr.io/<계정>` 또는 네이버 Container Registry `<이름>.kr.ncr.ntruss.com`, GitLab 레지스트리도 됨)
3. **production 승인** (GitHub Environments·GitLab Protected environments)
4. **SSH**: 서버 `DEPLOY_PATH`에 compose 파일 셋·`nginx/`·배포 스크립트 올림 (`git archive`, `.env.production`은 서버에 있는 것 그대로)
5. **새 이미지 pull**
6. **점검 켜기**: DB `maintenance_state` 켜고 `/internal/maintenance/reload` (새 방·시작·코드 입장 막음, 진행 중 판은 그대로)
7. **판 끝날 때까지 기다리기**: `/internal/live`의 `gameCount`가 0 될 때까지 15초마다, 최대 `drain_max_minutes`(30)분 — 넘으면 멈추고 점검 끔. 건너뛰기: `skip_maintenance`
8. **DB 백업**: `mysqldump --single-transaction` → `backups/backup-<시각>-before-<태그>.sql.gz` (비면 멈춤, 최근 20개만)
9. **migrate**: 새 이미지로 `status` → `migrate` → `status` (실패면 멈춤 — 지금 서버는 옛 이미지로 그대로 돎)
10. **켜기**: `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f deploy/ci/compose.registry.yml --env-file .env.production up -d --no-build`
11. **서버 안 확인**: `/health` 200(최대 3분) → `npm run admin -- check`(관리자 통로 열쇠 맞음·틀림·지금 상황)
12. **점검 끄기**, 태그 기록(`.deploy/current_tag`·`previous_tag`)
13. **바깥 확인**(러너에서): API `/health` 200 · 데스크톱·모바일 첫 화면 200 · 소켓 손잡기 101 — 배포 확인용 브라우저 묶음(`e2e/tests/prod-smoke`)은 아직 없음 → 생기면 `smoke.sh`에 이어 붙이기
14. **실패하면 되돌리기**(자동): 바로 전 태그로 `up -d` → `/health` → 점검 끔 → 바깥 확인. 손으로도: action `rollback`(태그 비우면 바로 전)

- **DB는 자동으로 안 되돌림**: 새 마이그레이션이 데이터 모양을 바꿨거나 migrate가 실패했으면 백업 복원은 사람이 `docs/마이그레이션_복구.md` 2장대로 (백업 파일 이름은 되돌리기 로그·`.deploy/last_backup`)
- migrate 실패 뒤엔 실패 이력 때문에 다음 백엔드 재시작이 막힘(옛 이미지도 CMD가 migrate 먼저) → 복구 전에 백엔드 다시 켜지 않기
- 서버에서 직접: `cd <DEPLOY_PATH> && IMAGE_REGISTRY=<값> bash deploy/ci/scripts/deploy/remote.sh status`
- `nginx/default.conf`·`nginx/tls/ssl.conf`의 도메인은 저장소에 고쳐 커밋해 둘 것 (배포 때 저장소 것으로 덮음)

### 서버 여러 대 (곧)

- `DEPLOY_HOSTS`(쉼표 목록)를 넣으면 차례로 배포, **앞의 하나만** 백업·migrate (DB는 하나)
- 서버마다 `.env.production`에 `SERVER_ID`(서버마다 다르게)·`REDIS_URL` — 근거 `docs/서버여러대_대비_2026-11-09.md`
- 점검 다시 읽기는 아직 서버 한 대에만 닿음(그 문서 27번) → Redis 알림 들어가기 전엔 1대로

## 4. 비밀값·환경값 (값은 여기 적지 않음)

GitHub: Settings → Environments → `staging`·`production` 만들고 각각에 **Secrets**/**Variables** · GitLab: Settings → CI/CD → Variables (Environment scope `staging`/`production`, Protected·Masked)

### 비밀값 (Secrets)

| 이름 | 무엇 | 만드는 법 |
| --- | --- | --- |
| `DEPLOY_HOST` | 서버 공인 IP 또는 도메인 | 네이버 클라우드 콘솔 |
| `DEPLOY_HOSTS` | (선택) 여러 대 쉼표 목록, 있으면 `DEPLOY_HOST` 대신 | |
| `DEPLOY_USER` | SSH 계정 (docker 쓸 수 있는, root 아닌 계정 권장) | 서버에서 `sudo adduser deploy && sudo usermod -aG docker deploy` |
| `DEPLOY_SSH_KEY` | 배포 전용 개인 키 **내용** 전체 | 내 PC: `ssh-keygen -t ed25519 -C mmc-deploy -f mmc_deploy -N ""` → `mmc_deploy.pub`를 서버 `~deploy/.ssh/authorized_keys`에, `mmc_deploy` 내용을 여기 |
| `DEPLOY_PATH` | 서버 안 폴더 (`.env.production` 있는 곳, 예 `/srv/mmc`) | 서버에서 만들고 deploy 계정 소유로 |
| `DEPLOY_SSH_KNOWN_HOSTS` | 서버 호스트 키 줄 (가짜 서버 막기, 권장) | 내 PC: `ssh-keyscan -p 22 <서버>` 출력 그대로 |
| `REGISTRY_USERNAME` | 레지스트리 로그인 이름 | GHCR: GitHub 계정 · NCR: 네이버 클라우드 API Access Key ID |
| `REGISTRY_PASSWORD` | 레지스트리 비번/토큰 | GHCR: PAT(`read:packages`·`write:packages`) — GitHub에선 비우면 실행 토큰으로 올림(서버 pull도 그 실행 동안만) · NCR: Secret Key |

- 앱 비밀값(DB 비번·JWT·HMAC·토스·메일·`INTERNAL_API_KEY`)은 CI에 넣지 않음 → 서버 `.env.production`에만 (`docs/배포_설정.md` 4장, `deploy-check` 점검표 ①②)
- GitLab에서 키는 Variable 종류 **File**도 됨 (`ship.sh`가 내용·파일 경로 둘 다 받음)
- 넣는 법(GitHub CLI): `gh secret set DEPLOY_SSH_KEY --env production < mmc_deploy` · `gh variable set IMAGE_REGISTRY --env production --body ghcr.io/<계정>` (값을 명령 줄·채팅에 붙여 넣지 말고 파일·표준 입력으로)

### 환경값 (Variables, 비밀 아님)

| 이름 | 예 | 무엇 |
| --- | --- | --- |
| `IMAGE_REGISTRY` | `ghcr.io/<계정 소문자>` · `<이름>.kr.ncr.ntruss.com` · GitLab `$CI_REGISTRY_IMAGE` | 이미지 올릴 곳 |
| `VITE_API_BASE_URL` | `https://api.<도메인>` (경로 없이) | 화면 빌드 때 박힘 (꼭) |
| `VITE_DISCORD_SUPPORT_URL`·`VITE_AD_PROVIDER`·`VITE_ADSENSE_*` | | 선택, `frontend/Dockerfile` ARG |
| `SMOKE_API_URL`·`SMOKE_DESKTOP_URL`·`SMOKE_MOBILE_URL` | `https://api.<도메인>` · `https://<도메인>` · `https://m.<도메인>` | 배포 뒤 바깥 확인 |
| `DEPLOY_PORT` | `22` | SSH 포트 |

## 5. 승인 (production)

- GitHub: Settings → Environments → `production` → **Required reviewers**에 승인할 사람, **Deployment branches and tags**는 `main`·`v*`만 → 배포·되돌리기 일이 승인 기다림 (자동 되돌리기도 승인 받고 돎)
- GitLab: Settings → CI/CD → Protected environments → `production` 승인자, `v*` 태그는 Protected tags로
- staging은 승인 없이 (서버가 생기면 staging 먼저 → 확인 → 같은 커밋에 `v*` 태그)

## 6. 서버 처음 한 번

1. docker·compose 2.24 이상 설치, deploy 계정 docker 그룹
2. `DEPLOY_PATH` 만들고 `.env.production` 넣기 (`docs/배포_설정.md` 4장), 인증서 받기(같은 문서 4-3)
3. GitHub/GitLab에 '4. 비밀값' 넣기 → staging 손으로 한 번 → `remote.sh status`로 태그 확인
4. `deploy-check` 점검표(키 새로 받기·도메인·소켓 101·연기 시험) 따로 돌리기
