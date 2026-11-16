# A16 DB·마이그레이션 — 시험 케이스 목록

이 글은 마이그레이션(DB 표 바꾸기) 0001~0034를 올리고·다시 올리고·되돌리고·실패하는 길과, 표 49개의 겹치면 안 되는 것·외래키(다른 표와 잇는 칸)·모델(코드 속 표 정의)이 문서와 같은지를 겉으로 보이는 결과로 적은 목록임 (목표 백 150 · 화 0 · 모 0 · 브 0 = 150).

- 번호: A16-B(백)-세 자리
  - 순수 001~020 · DB 101~285 (아래 구간마다 번호대를 나눔)
- 종류: 순수 = 실행기(마이그레이션 돌리는 프로그램)의 판단 함수에 값을 넣고 돌려준 값만 봄 / DB = 시험 DB에 진짜로 올리고 넣고 읽음 / DB(프로세스) = 명령 파일을 따로 띄워 종료 코드·출력 봄
- 인원: 이 영역은 판을 안 차림 → 인원 칸 없음
- 표 돌리기는 번호 범위 한 줄 + "값" 목록 (값 하나 = 케이스 하나)
- [단위 8] = `고치기_계획.md` 단위 8 "시험 단계가 꼭 넣을 케이스", [지금 동작] = 출처 없어 지금 동작을 임시 정답으로 씀
- 받은 버그 9개(시험_계획 2-6)는 A16에 걸린 것 없음
- DB 시험이 도는 곳: 시험 DB(`pluto_f01_20260909_al`) 하나를 `tools/시험도구/with-lock.sh testdb`로 한 줄로 세워 씀. 주소는 `F01_TEST_DATABASE_URL`(이름만), 없으면 건너뜀. **DB 주소·비밀번호는 글·출력에 안 적음**
- "빈 DB" = 시험 DB 도우미 `resetManagedSchema`로 표를 다 지운 상태(이력 표 `schema_migrations`도 없음)
- "끝까지 올린 DB" = 빈 DB에 `MIGRATIONS` 34개를 `applyMigrations`로 다 올린 상태
- "시험용 마이그레이션" = 시험 파일 안에서만 만든 작은 마이그레이션 객체(이름 `9901-test-…`). 목록 끝에 붙여 실패·verify 실패를 일부러 냄. 진짜 `backend/db/migrations`엔 안 넣음
- 되돌리기(down)는 명령(`migrate-db.js`)에 없음 → 시험은 마이그레이션 파일의 `down`을 직접 부름. 운영의 되돌리기는 백업 복원(복구 2장 A)
- "겹침 거절" = 같은 값 두 줄을 SQL로 직접 넣으면 두 번째가 MySQL 중복 오류(`ER_DUP_ENTRY`)로 막히고, 오류에 적힌 목차(찾기 목차, 인덱스) 이름이 기대 이름과 같고, 줄은 1개만 남음
- "외래키 거절" = 없는 부모 값을 넣으면 MySQL 오류(`ER_NO_REFERENCED_ROW_2`)로 막히고 줄 0개
- A18과 나눔: 서버 켜기(`[STARTUP] 성공`·종료 코드)는 A18 B-301~304, 표 준비 판정 순수 2개는 A18 B-045·046. 여기선 "준비됐는지 검사" 함수(`ensureSchemaReady`)가 진짜 DB에서 돌려주는 답만 봄
- A09·A07과 나눔: 탈주 기록 저장소가 같은 판을 두 번 적을 때는 A09 B-416~419, 판 골드 값 읽기·바꾸기는 A07 B-230~238. 여기선 표 모양과 표가 직접 막는 것만
- 코드에서 찾은 이름 (정답 아님, 찾기용)
  - 실행기 `backend/db/migrationRunner.js`: `checksumOf`(체크섬, 파일 지문)·`getStatus`(상태 보기)·`applyMigrations`(올리기)·`resolveFailure`(실패 이력 정리)·`diagnoseFailure`, 이력 표 `META_TABLE` = `schema_migrations`(칸 `name`·`checksum`·`status`·`started_at`·`finished_at`·`error_message`), 잠금 이름 `LOCK_NAME` = `al_f01_schema_migrations`, 잠금 기다림 30초
  - 준비 검사 `backend/db/schemaReadiness.js`: `summarize`·`describeProblems`·`ensureSchemaReady(sequelize, { env, migrations, warn })`, 오류 코드 `SCHEMA_NOT_READY`
  - 명령 `backend/scripts/migrate-db.js`: 목록 `MIGRATIONS`(34개), `parseArgs`, 명령 `status`·`migrate`·`resolve-failure --name <이름> --confirm`
  - 새 표: `0033-add-game-desertions.js`(`TABLES`·`REASONS`·`INDEXES`·`FOREIGN_KEYS`), `0034-add-game-settings.js`(`TABLES`·`SETTING_KEYS`·`SEED_ROWS`)
  - 모델: `backend/models/**` (표 47개), 모델 `game/gameDesertion.model.js`·`ops/gameSetting.model.js`, 칸 읽기 도우미 `backend/tests/helpers/schemaMeta.js`
  - 시험 DB 도우미 `backend/tests/helpers/isolatedTestDb.js`: `buildManagedSchema`·`resetManagedSchema`(표 지우기)·`resetManagedData`(줄 비우기)·`assertDedicatedTestDatabase`·`assertNoUnknownTables`·`findNonEmptyManagedTables`, 허락된 DB 이름 2개
  - 시험 DB 만들기 `backend/scripts/setup-test-db.js` (`npm run test:db:setup`)

## 출처 줄임

이 표는 "정답의 출처" 칸에 쓴 줄임말이 어느 글 어느 줄인지 보여 줌.

| 줄임 | 원래 줄 |
|---|---|
| 단위 8 | `고치기_계획.md` 단위 8 "시험 단계가 꼭 넣을 케이스" (빈 DB 끝까지 → 두 표·마지막 0034 / 두 번 돌려도 오류 없음 / down은 두 표만 / `GAME_GOLD_REWARD = 1` 한 줄 / 같은 사람·같은 판 두 번째 막힘), 같은 단위 "등록 목록·시험 DB 준비에 들어감" |
| 고치기 4장 | `고치기_계획.md` 4장 (0033 `game_desertions` 칸·목차, 0034 `game_settings` 칸·처음 줄, "다시 돌려도 안전, down은 그 표만") |
| 결정「탈주 벌」 | `결정.md` "탈주 벌" — 탈주 기록을 DB에 저장(새 마이그레이션) |
| 결정「골드」 | `결정.md` "판 끝 — 재화 보상" — 지금 1골드, 관리자가 조정, 값 저장할 곳(새 마이그레이션) |
| 복구 머리 · 복구 n | `docs/마이그레이션_복구.md` 머리(이력 표 상태 `running`/`applied`/`failed`, `GET_LOCK`으로 동시에 하나) · 1장(평소 적용, 5번 "다시 status → 전부 applied") · 2장(실패하면 `failed`, 다음 `migrate` 시작 거부) · 2B(`resolve-failure`, `--confirm` 없으면 거부, DDL 뒤 실패 표시·`running` 멈춤) · 3장(새 DB는 0001부터, sync로 만든 DB는 거부될 수 있음) |
| DB변경 D-n · DB변경 0028 | `docs/DB_변경_2026-11-09.md` 바꾼 것 표 (D-01 시작 때 이력만 확인·운영은 거부·개발은 경고만·표 안 만듦·여러 대는 잠금 / D-02 0020 외래키·고아 줄이면 멈춤 / D-11 모델 NOT NULL 맞춤 / "모델" 줄 세 곳 같은 모양 / 0021 유일 안 검) · "0028 안 쓰는 칸·표 지움" 절 · "개발 DB 비움" 절(점검 1줄·약관 자리 2개, 배포 땐 DB 비운 채) |
| 배포 7-3 | `docs/배포_설정.md` 7-3 0번 (migrate는 `compose run` 한 번) |
| ERD <표> | `reports/DB_ERD_설명_2026-11-15/content/*.md` 그 표의 "겹치면 안 되는 것"·"이어지는 표"·"조심할 곳" 줄 (0001~0032 기준 표 47개) |
| ERD 양식 | `reports/DB_ERD_설명_2026-11-15/_양식.md` "모델 없는 표 2개(`refresh_token_history`, `schema_migrations`)" |
| 머리 nnnn | `backend/db/migrations/nnnn-*.js` 맨 위 주석 |
| 실행기 :n | `backend/db/migrationRunner.js` n줄 주석 (3 머리 · 10 잠금 30초 · 12 체크섬 = 이름 + up·down 원문, 함수 안 주석도 들어감 · 38 끝나면 무슨 일이 있어도 풂 · 68 도중에 죽으면 running · 87 잠금 없이 읽기만 · 117 적용됨은 건너뜀·failed·running은 멈춤 · 129 파일 바뀌면 멈춤 · 179 failed로 남김·DDL 뒤 실패면 표시) |
| 준비검사 :n | `backend/db/schemaReadiness.js` n줄 주석 (3·4 머리 "표를 만들지는 않음", 7 연결 실패와 문구 나누기, 13 세 갈래, 21 사람이 읽을 한 줄) |
| 명령 :n | `backend/scripts/migrate-db.js` n줄 주석 (44 적용 순서 그대로·새 것은 끝에, 61 체크섬 다르면 표시, 72 status: failed·running이면 1, 87 migrate: failed·running 있으면 아예 시작 안 함) |
| 도우미 | `backend/tests/helpers/isolatedTestDb.js` 주석 (지울 때 자식 표 먼저, 처음 값 넣는 표는 줄 비우기에서 뺌) · `backend/scripts/setup-test-db.js` 머리 (허락된 두 이름만) |
| 계획 4-5 | `시험_계획.md` 4-5 ("허락된 이름 2개 말고는 지우기 거부") |

## 케이스 목록

### 백엔드 — 순수 (20)

이 표는 실행기·준비 검사·명령의 판단 부분에 값을 넣고 돌려준 값만 보는 케이스임. DB에 안 붙음.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-001 | [단위 8] 마이그레이션 목록은 34개, 마지막이 0034 | `MIGRATIONS` → 길이 34, 첫 이름 `0001-legacy-baseline`, 끝 이름 `0034-add-game-settings` | 단위 8 ("마지막 이름이 0034"), 고치기 4장 | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-002 | 목록이 번호 차례대로, 빈 번호 없음 | `MIGRATIONS` 이름 앞 네 자리 → 0001, 0002, …, 0034 하나씩 늘어남 (0033 다음 0034, 0035 없음) | 명령 :44 (적용 순서 그대로·새 것은 끝에), 고치기 4장 ("0035부터는 안 씀") | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-003 | 이름 = 파일 이름, 이름 겹침 없음 | 마이그레이션마다 `name` → `backend/db/migrations/<name>.js` 파일이 있음, 34개 이름이 서로 다름 | 복구 머리 (이력은 이름으로 한 줄), ERD schema_migrations (`name` 겹치면 안 됨) | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-004 | 같은 마이그레이션의 체크섬은 늘 같음 | `checksumOf(0034)` 두 번 → 같은 글자, 16진수 64자 | 실행기 :12 | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-005 | [지금 동작] 함수 밖 "처음 넣는 값"만 바꾸면 체크섬이 같음 | 0034 복사본에서 up·down 함수 밖의 처음 값 1 → 2로만 바꿈 → 원본과 같은 값 (검사는 이름과 up·down 함수 글만 봄 — 못 알아채는 한계) | 실행기 :12 (이름 + up·down 원문), 모음 글 C-028 (셈법을 바꾸면 이미 적용한 34개가 전부 "바뀜"으로 떠 운영 DB가 멈출 수 있어 그대로 둠) | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-006 | down이 있고 없고도 체크섬에 들어감 | 같은 이름·같은 up, down 함수 있음 / 없음 → 두 값이 다름 | 실행기 :12 (이름 + up·down 원문) | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-007 | 함수 안 주석만 바꿔도 체크섬이 다름 | 0033 복사본 up 안에 주석 한 줄 더함 → 원본과 다른 값 | 실행기 :12 ("함수 안 주석도 들어감") | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-008 | 이름만 달라도 체크섬이 다름 | up·down 같고 `name`만 `0034-x` → 다른 값 | 실행기 :12 | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-009~014 | 상태 줄을 세 갈래로 나눔 | `summarize(줄 34개)` (값 6): (34개 다 `applied`·체크섬 맞음 → `ready` true, 세 목록 빔) (0034만 `pending` → `pending` = [0034], `ready` false) (0033 `failed` → `broken` = [0033]) (0033 `running` → `broken` = [0033]) (0034 `applied`인데 체크섬 안 맞음 → `changed` = [0034]) (0032 `pending` + 0033 `failed` + 0034 체크섬 다름 → 세 목록에 하나씩, `ready` false) | 준비검사 :13, DB변경 D-01 ("안 돌린·실패한·적용 뒤 바뀐"), 복구 2 (`running`도 멈춘 것) | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-015 | 사람이 읽을 한 줄에 세 갈래 이름과 할 일이 다 들어감 | `describeProblems({ pending:[0032], broken:[0033], changed:[0034] })` → "안 돌린 마이그레이션 1개 [0032-add-inquiries]", "실패·멈춘 마이그레이션 [0033-add-game-desertions]", "적용 뒤 파일이 바뀐 마이그레이션 [0034-add-game-settings]", 끝에 `migrate-db.js status` 확인하고 `migrate` 돌리기 | DB변경 D-01 (`[STARTUP] 실패 — DB 표 준비 안 됨: …` 한 줄), 준비검사 :21 | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-016 | 0033·0034만 안 돌렸을 때 글 | `describeProblems({ pending:[0033, 0034], broken:[], changed:[] })` → "안 돌린 마이그레이션 2개 [0033-add-game-desertions, 0034-add-game-settings]", "실패"·"바뀐" 글은 없음 | 단위 8 (두 표가 등록 목록에 들어감), DB변경 D-01 | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-017~019 | 명령 글자 읽기 | `parseArgs` (값 3): (`["migrate"]` → 명령 `migrate`, 옵션 빔) (`["resolve-failure","--name","0034-add-game-settings","--confirm"]` → 이름 `0034-add-game-settings`, `confirm` true) (`["resolve-failure","--name=0033-add-game-desertions"]` → 이름 `0033-add-game-desertions`, `confirm` 없음) | 복구 2B 명령 모양 (`--name <이름> --confirm`) | 순수 | backend/tests/unit/a16-migration-runner.test.js |
| A16-B-020 | 확인 표시 없이 실패 이력 정리 거절 | `resolveFailure({ sequelize: 없음, name: '0034-add-game-settings', confirmRecovered: false })` → 오류 "confirmRecovered=true 없이는 실패 이력을 정리할 수 없습니다" (DB를 안 봐도 바로 거절) | 복구 2B ("`--confirm` 없으면 거부") | 순수 | backend/tests/unit/a16-migration-runner.test.js |

### 백엔드 — DB: 빈 DB에 끝까지 올리기 (8)

이 표는 빈 시험 DB에 0001~0034를 차례로 올렸을 때 다 올라가고, 표 49개와 처음 값 줄이 생기는지 보는 케이스임.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-101 | [단위 8] 빈 DB에 34개가 다 올라감 | 빈 DB + `applyMigrations(MIGRATIONS)` → 오류 없음, 돌려준 `applied` = 34개 이름 목록 차례 그대로, 마지막 `0034-add-game-settings` | 단위 8, 복구 3 (빈 DB면 0001부터 전부 만듦) | DB | backend/tests/db/a16-migrate-all.integration.test.js |
| A16-B-102 | 표가 정확히 49개 | B-101 뒤 `SHOW TABLES` → 아래 부록 1 "표 49개" 목록과 정확히 같음 (더도 덜도 없음): `game_desertions`·`game_settings`·`schema_migrations` 있음, `traffic_logs`(0028이 지움) 없음 | 단위 8 (두 표가 생김), ERD (표 47개) + 고치기 4장 (새 표 2개), DB변경 0028 | DB | backend/tests/db/a16-migrate-all.integration.test.js |
| A16-B-103 | 이력 표에 34줄 다 `applied` | B-101 뒤 `schema_migrations` → 34줄, 줄마다 `status` = `applied`, `checksum` = 그 마이그레이션 `checksumOf` 값, `finished_at` 채워짐, `error_message` 빈 값 | 복구 머리·1장 5번 ("전부 applied") | DB | backend/tests/db/a16-migrate-all.integration.test.js |
| A16-B-104 | [단위 8] 판 골드 처음 줄 하나 | B-101 뒤 `game_settings` → 1줄, `key` = `GAME_GOLD_REWARD`, `value_int` = 1, `updated_by` 빈 값 | 단위 8, 고치기 4장, 결정「골드」(지금은 1골드) | DB | backend/tests/db/a16-migrate-all.integration.test.js |
| A16-B-105 | 점검 상태 줄은 처음부터 하나 | B-101 뒤 `maintenance_state` → 1줄, `id` 1, `is_enabled` 0(꺼짐) | ERD maintenance_state ("늘 한 줄"), DB변경 개발 DB 비움 ("점검 상태 1줄은 마이그레이션이 넣음") | DB | backend/tests/db/a16-migrate-all.integration.test.js |
| A16-B-106 | 약관 자리 2개가 처음부터 있음 | B-101 뒤 `terms_versions` → 2줄: (`kind` `TERMS`, `version` `0.1-placeholder`) (`PRIVACY`, `0.1-placeholder`) | 머리 0026 (자리용 약관 2개), DB변경 개발 DB 비움 ("약관 자리 2개") | DB | backend/tests/db/a16-migrate-all.integration.test.js |
| A16-B-107 | 나머지 표는 빈 채로 | B-101 뒤 처음 값 세 표(`maintenance_state`·`terms_versions`·`game_settings`)와 `schema_migrations`를 뺀 45개 표 → 줄 0개 (상품·계정·금지어 등 안 넣음) | 머리 0018 ("운영 상품은 이 마이그레이션이 넣지 않음"), DB변경 개발 DB 비움 ("배포할 땐 DB는 아무것도 없는 상태로") | DB | backend/tests/db/a16-migrate-all.integration.test.js |
| A16-B-108 | 0032까지 올린 DB에 이어서 올리면 새 두 개만 | 빈 DB에 `MIGRATIONS` 앞 32개만 올림 → 그다음 34개 목록으로 다시 올림 → `applied` = [`0033-add-game-desertions`, `0034-add-game-settings`]만, 앞 32줄의 `started_at`·`finished_at`은 첫 번 그대로, 표 49개 | 단위 8, 복구 1장 (새 마이그레이션 들어간 배포) | DB | backend/tests/db/a16-migrate-all.integration.test.js |

### 백엔드 — DB: 다시 올려도 안전 (7)

이 표는 이미 올린 것을 또 올려도 오류가 없고, 처음 값 줄을 덮지 않는지 보는 케이스임.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-111 | [단위 8] 두 번째 올리기는 아무것도 안 함 | 끝까지 올린 DB + `applyMigrations` 한 번 더 (로그 받기) → 오류 없음, `applied` 빈 목록, 로그에 "skip … (이미 적용됨)" 34줄, 표 49개 그대로 | 단위 8 ("두 번 돌려도 오류 없음"), 실행기 :117 | DB | backend/tests/db/a16-rerun.integration.test.js |
| A16-B-112 | 두 번째 올리기 뒤 이력 줄이 안 늘어남 | B-111 뒤 `schema_migrations` → 34줄 그대로, 줄마다 `id`·`started_at`·`finished_at`·`checksum`이 첫 번째 올린 뒤 값과 같음 | 실행기 :117 (적용됨은 건너뜀), 복구 머리 (이름마다 한 줄) | DB | backend/tests/db/a16-rerun.integration.test.js |
| A16-B-113 | 관리자가 바꾼 판 골드는 다시 올려도 그대로 | 끝까지 올린 DB → `game_settings` `GAME_GOLD_REWARD` 값 5·`updated_by` 관리자 uuid로 바꿈 → `applyMigrations` 다시 → 값 5, `updated_by` 그 uuid 그대로, 줄 1개 | 머리 0034 ("관리자가 바꾼 값 안 덮음"), 결정「골드」(관리자 조정) | DB | backend/tests/db/a16-rerun.integration.test.js |
| A16-B-114 | 0034의 up을 이력 없이 또 불러도 값을 안 덮음 | 끝까지 올린 DB → 값 7로 바꿈 → 0034 `up`을 직접 부름 → 오류 없음, `game_settings` 1줄, 값 7 그대로 | 머리 0034 ("처음 줄은 없을 때만 넣음, 다시 돌려도 안전") | DB | backend/tests/db/a16-rerun.integration.test.js |
| A16-B-115 | 처음 줄이 없을 때만 다시 넣음 | 끝까지 올린 DB → `game_settings` 줄 지움 → 0034 `up` 직접 → `GAME_GOLD_REWARD` 1인 줄 1개 다시 생김, `updated_by` 빈 값 | 머리 0034, 단위 8 (`GAME_GOLD_REWARD = 1` 한 줄) | DB | backend/tests/db/a16-rerun.integration.test.js |
| A16-B-116 | 0033: 표 만든 뒤 목차 하나가 빠진 경우 채움 | 끝까지 올린 DB + 탈주 줄 2개 넣음 → 목차 `game_desertions_blocked_until_idx` 지움 → 0033 `up` 직접 → 목차 3개 다시 있음(같은 이름 두 개 없음), 탈주 줄 2개 그대로, 0033 `verify` 통과 | 머리 0033 ("없는 표만 만듦·인덱스 따로 확인"), 머리 0024 ("표 만든 뒤 죽은 경우") | DB | backend/tests/db/a16-rerun.integration.test.js |
| A16-B-117 | 점검을 켜 둔 값도 다시 올려도 그대로 | 끝까지 올린 DB → `maintenance_state` `is_enabled` 1·`message` "점검 중"으로 바꿈 → 0024 `up` 직접 → 값 그대로, 줄 1개 | 머리 0024 ("없는 것만 만듦, 다시 돌려도 안전"), ERD maintenance_state | DB | backend/tests/db/a16-rerun.integration.test.js |

### 백엔드 — DB: 실패 기록과 다시 하기 (12)

이 표는 올리다 실패했을 때 이력 표에 `running`·`applied`·`failed`가 어떻게 남고, 정리한 뒤 다시 할 수 있는지 보는 케이스임. 실패는 목록 끝에 붙인 시험용 마이그레이션으로 냄.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-121 | up이 오류 나면 `failed`로 남음 | 목록 = 34개 + 시험용(up이 오류 "시험 실패" 던짐) → `applyMigrations`가 같은 오류를 던짐, 시험용 줄 `status` `failed`·`error_message` "시험 실패"·`finished_at` 채워짐, 앞 34줄은 `applied` 그대로 | 복구 2 ("그 마이그레이션이 failed로 남음"), 실행기 :179 | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-122 | 표는 만들고 확인(verify)에서 실패하면 표시가 붙음 | 시험용 up이 표 `zz_a16_half` 만들고 verify가 오류 → `failed`, `error_message`가 `[DDL은 성공, 이후 단계(verify 또는 이력 기록)에서 실패]`로 시작, 표 `zz_a16_half`는 남아 있음 | 복구 2B (오류 문구에 그 표시), 복구 2A ("DDL은 바로 확정돼 반쯤 상태가 남을 수 있음") | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-123 | 실패 이력이 있으면 다음 올리기를 거부 | B-121 상태 그대로 다시 `applyMigrations`(시험용 뒤에 표 만드는 두 번째 시험용도 붙임) → 오류 "실패 이력이 있어 무조건 재적용할 수 없습니다", 시험용 줄 `failed` 그대로, 두 번째 시험용 표는 안 생김 | 복구 2 ("다음 migrate는 그 이력 때문에 시작을 거부") | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-124 | `running`으로 남은 줄이 있으면 거부 | 끝까지 올린 DB에 시험용 이름으로 `status` `running` 줄을 직접 넣음 → `applyMigrations` → 오류 "running 상태로 남아 있습니다", 시험용 up 안 돎 | 복구 2B ("running으로 멈춘 줄 = 중간에 죽은 흔적") | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-125 | 도는 동안엔 `running` 줄이 먼저 있음 | 시험용 up 안에서 `schema_migrations`의 자기 줄을 읽어 둠 → 그때 `status` `running`, `finished_at` 빈 값 / 끝난 뒤 `applied` | 실행기 :68 ("도중에 죽으면 running으로 남아 알 수 있게"), 복구 머리 | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-126 | 실패 이력 정리 뒤 다시 하면 `applied` | B-121 상태 → 시험용을 오류 안 나게 바꾸고 `resolveFailure({ name, confirmRecovered: true })` → 돌려준 값 `{ cleared: 시험용 이름, previousStatus: 'failed' }`, 그 줄 없음 → `applyMigrations` → 시험용 `applied` | 복구 2B 2·3번 | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-127 | `running` 줄도 정리됨 | B-124 상태 → `resolveFailure(confirm true)` → `previousStatus` `running`, 그 줄 없음 | 복구 2B ("running으로 멈춘 줄") | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-128 | 잘 올라간 줄은 정리 거절 | 끝까지 올린 DB → `resolveFailure({ name: '0034-add-game-settings', confirmRecovered: true })` → 오류 "failed/running 상태가 아닙니다 (현재: applied)", 줄 그대로 | 복구 2B (failed·running일 때만 정리) | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-129 | 없는 이름은 정리 거절 | `resolveFailure({ name: '9999-none', confirmRecovered: true })` → 오류 "실패 이력을 찾을 수 없습니다" | 복구 2B | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-130 | 상태 보기는 읽기만 함 | 빈 DB(이력 표 없음) + `getStatus` → 34개 전부 `pending`, `checksumMatches` 빈 값 / 그 뒤 `SHOW TABLES` → 0개 (이력 표도 안 만듦) | 실행기 :87 ("읽기만"), DB변경 D-01 ("표는 안 만듦") | DB | backend/tests/db/a16-failure.integration.test.js |
| A16-B-131 | 명령 `status`는 실패가 있으면 종료 1 | 작업 폴더 = 빈 임시 폴더, `DATABASE_URL` = 시험 DB(값 안 찍음) → (끝까지 올린 DB → `node <저장소>/backend/scripts/migrate-db.js status` → 종료 0, 34줄 `applied`) (0034 줄을 `failed`로 바꿈 → 종료 1, 출력에 `0034-add-game-settings`·`failed`·"복구 절차를 먼저 수행") — 한 시험 안에서 둘 다 봄 | 복구 1장 3번 ("failed·running 있으면 2장 먼저"), 명령 :72 | DB(프로세스) | backend/tests/db/a16-failure.integration.test.js |
| A16-B-132 | 명령 `migrate`는 실패가 있으면 아예 시작 안 함 | 0032까지 올린 DB + 0032 줄을 `failed`로 바꿈 → `migrate-db.js migrate` → 종료 1, 출력 "무조건 재적용을 차단", 표 `game_desertions`·`game_settings` 안 생김 | 복구 2, 명령 :87 | DB(프로세스) | backend/tests/db/a16-failure.integration.test.js |

### 백엔드 — DB: 잠금 (4)

이 표는 같은 때 두 곳에서 올리려 하면 한 곳만 도는지 보는 케이스임. MySQL 연결을 둘 열어 흉내 냄. B-141은 잠금 기다림 30초를 진짜로 기다림.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-141 | 다른 곳이 잠금을 쥐고 있으면 거절 (진짜 30초) | 연결 B가 `GET_LOCK('al_f01_schema_migrations', 0)` 쥔 채 연결 A가 빈 DB에 `applyMigrations` → 약 30초 뒤 오류 "다른 마이그레이션 실행이 이미 진행 중입니다", 표 0개 그대로(이력 표도 없음) | 복구 머리 (`GET_LOCK`으로 동시에 하나), DB변경 D-01 ("여러 대 동시 시작은 잠금으로 한 번에 하나"), 실행기 :10 (30초) | DB | backend/tests/db/a16-lock.integration.test.js |
| A16-B-142 | 두 곳이 같은 순간 올려도 한 벌만 | 빈 DB, 연결 둘이 같은 순간 `applyMigrations` → 둘 다 끝난 뒤 `schema_migrations` 34줄(이름 겹침 없음), 표 49개, 한쪽 `applied` 34개·다른 쪽 `applied` 빈 목록 (앞쪽이 30초 넘게 걸리면 다른 쪽은 잠금 거절 오류 — 그래도 줄 34·표 49) | DB변경 D-01, 배포 7-3 (migrate 한 번) | DB | backend/tests/db/a16-lock.integration.test.js |
| A16-B-143 | 다 올리고 나면 잠금을 풂 | 끝까지 올린 뒤 다른 연결 `GET_LOCK('al_f01_schema_migrations', 0)` → 1(바로 잡힘) | 실행기 :38 ("끝나면 무슨 일이 있어도 풂") | DB | backend/tests/db/a16-lock.integration.test.js |
| A16-B-144 | 실패해도 잠금을 풂 | B-121처럼 시험용이 실패한 직후 다른 연결 `GET_LOCK(…, 0)` → 1 | 실행기 :38 | DB | backend/tests/db/a16-lock.integration.test.js |

### 백엔드 — DB: 내용이 바뀐 마이그레이션 (3)

이 표는 이미 올린 마이그레이션 파일이 바뀌었을 때(체크섬 다름) 알아채는지 보는 케이스임. 진짜 파일은 안 고치고, 시험 안에서 복사본으로 목록을 바꿔 줌.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-151 | 올린 뒤 파일이 바뀌면 올리기가 멈춤 | 끝까지 올린 DB → 목록의 0034를 up 한 줄 다른 복사본으로 바꾸고 끝에 시험용(표 만들기) 붙여 `applyMigrations` → 오류 "체크섬이 기록과 다릅니다", `game_settings` 값·0034 이력 줄 그대로, 시험용 표 안 생김 | DB변경 D-01 ("적용 뒤 바뀐 마이그레이션"), 실행기 :129 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-152 | 상태 보기가 바뀐 것을 표시 | B-151 목록으로 `getStatus` → 0034만 `checksumMatches` false, 나머지 33개 true / 명령 `status` 출력엔 0034 줄에 `[체크섬 불일치]` | 명령 :61, DB변경 D-01 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-153 | 이력 쪽 체크섬이 바뀌어도 알아챔 | 끝까지 올린 DB → `schema_migrations` 0033 줄 `checksum`을 다른 64자로 바꿈 → `applyMigrations` 오류 "체크섬이 기록과 다릅니다", `getStatus` 0033 `checksumMatches` false | 실행기 :129 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |

### 백엔드 — DB: "준비됐는지 검사" 함수의 답 (7)

이 표는 서버 켜기 전 검사 `ensureSchemaReady`가 진짜 DB에서 무엇을 돌려주고 언제 거절하는지 보는 케이스임. 서버를 띄워 안 켜지는지는 A18 몫.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-161 | 0034만 안 올렸으면 운영은 거절 | 0033까지 올린 DB + `ensureSchemaReady(sequelize, { env:'production' })` → 오류 `code` `SCHEMA_NOT_READY`, 글에 "안 돌린 마이그레이션 1개 [0034-add-game-settings]", 표 `game_settings` 안 생김 | DB변경 D-01 (운영은 시작 거부), 단위 8 (등록 목록에 들어감), 복구 1장 5번 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-162 | 0033·0034 둘 다 안 올렸으면 둘 다 이름이 나옴 | 0032까지 올린 DB + 운영 → 오류 `SCHEMA_NOT_READY`, 글 "안 돌린 마이그레이션 2개 [0033-add-game-desertions, 0034-add-game-settings]" | DB변경 D-01, 단위 8 (A18 단위 8 "0033·0034가 안 올라간 DB에선 운영 서버가 안 켜짐"의 검사 쪽) | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-163 | 실패 이력이 있으면 운영은 거절 | B-121처럼 0034 줄이 `failed`인 DB + 운영 → 오류 `SCHEMA_NOT_READY`, 글 "실패·멈춘 마이그레이션 [0034-add-game-settings]" | 복구 2 ("실패 이력이면 시작 거부"), DB변경 D-01 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-164 | 바뀐 파일이 있으면 운영은 거절 | B-151 목록 + 운영 → 오류 `SCHEMA_NOT_READY`, 글 "적용 뒤 파일이 바뀐 마이그레이션 [0034-add-game-settings]" | DB변경 D-01 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-165 | 빈 DB면 34개 다 안 돌림, 표는 안 만듦 | 빈 DB + 운영 → 오류 글 "안 돌린 마이그레이션 34개", 끝난 뒤 `SHOW TABLES` 0개 | 준비검사 :3 ("표를 만들지는 않음"), DB변경 D-01 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-166 | 개발·시험 값이면 경고 한 줄만 | 0033까지 올린 DB + `env:'development'`(경고 받기 함수 넣음) → 안 던짐, 돌려준 `ready` false·`pending` [0034], 경고 한 번 "[STARTUP] 경고 — DB 표 준비 안 됨: …", 표 `game_settings` 안 생김 | DB변경 D-01 ("개발·시험: 경고 한 줄만 남기고 켬, 표는 안 만듦") | DB | backend/tests/db/a16-checksum-ready.integration.test.js |
| A16-B-167 | 다 올렸으면 운영도 통과, 경고 없음 | 끝까지 올린 DB + 운영 → 안 던짐, `ready` true, 세 목록 빔, 경고 0번 | 복구 1장 5번, DB변경 D-01 | DB | backend/tests/db/a16-checksum-ready.integration.test.js |

### 백엔드 — DB: 되돌리기(down) (9)

이 표는 마이그레이션 파일의 `down`이 그 파일이 만든 것만 지우는지, 데이터를 잃는 되돌리기는 거절하는지 보는 케이스임. 뜻 있는 것만 넣음.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-171 | [단위 8] 0034 down은 판 설정 표만 지움 | 끝까지 올린 DB + `users` 1줄·`game_desertions` 1줄·`notifications` 1줄 넣음 → 0034 `down` → `game_settings` 없음, 표 48개, 넣은 세 줄 그대로 | 단위 8 ("down이면 두 표만 지워지고 다른 표는 그대로"), 머리 0034 | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-172 | [단위 8] 0033 down은 탈주 기록 표만 지움 | 끝까지 올린 DB + `users` 1줄 → 0033 `down` → `game_desertions` 없음, `users` 줄·`game_settings` 줄 그대로, 표 48개 | 단위 8, 머리 0033 | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-173 | 0034 down 뒤 up이면 처음 값 1로 (관리자 값은 사라짐) | 값 5로 바꿈 → 0034 `down` → 0034 `up` → `GAME_GOLD_REWARD` 1, `updated_by` 빈 값 | 머리 0034 (down 주석 "관리자가 바꾼 값도 사라짐") | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-174 | 0033 down 뒤 up이면 목차·외래키까지 다시 | 0033 `down` → `up` → 0033 `verify` 통과(칸 6·목차 3·`user_id` 외래키) | 머리 0033 | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-175 | 0031 down은 자기가 만든 것만 | 끝까지 올린 DB → 0031 `down` → `admin_sessions`·`admin_login_attempts` 없음, `admin_users`·`admin_audit_logs`·`user_bans` 표는 남고 0031이 더한 칸·목차(예 `admin_users_email_unique`)만 빠짐, 0024의 `admin_users_login_id_unique`는 남음 | 머리 0031 ("down은 이 파일이 만든 것만 지움") | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-176 | 결제 이력 표는 되돌리기 거절 | 끝까지 올린 DB → 0018 `down` → 오류 "down()은 지원하지 않습니다 — 결제 이력을 지우는 파괴적 변경", `economy_currency_products`·`economy_topup_orders` 그대로 | 머리 0018 | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-177 | 비번 재설정 토큰 바꾼 것도 되돌리기 거절 | 0015 `down` → 오류 "down()은 지원하지 않습니다", `password_reset_tokens.token_hash`·`users.has_local_password` 칸 그대로 | 머리 0015 (토큰 원문 되살리기는 데이터 조작) | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-178 | 0028 down은 칸·표 모양만 되살림 | 끝까지 올린 DB + `users` 1줄 → 0028 `down` → `users.phone`·`user_sessions.last_ping_at`·`online_presence.current_room_id` 칸과 `traffic_logs` 표가 다시 있음, 그 `users` 줄 `phone` 빈 값 | DB변경 0028 ("down: 같은 모양으로 다시 만듦, 지운 값은 못 되살림") | DB | backend/tests/db/a16-down.integration.test.js |
| A16-B-179 | 닉네임 칸 줄이기는 잘릴 값 있으면 거절 | 끝까지 올린 DB + `game_result_players.nickname_snapshot` 31자 줄 하나 → 0002 `down` → 거절(30자로 줄이면 잘림), 칸 길이 50 그대로, 그 줄 31자 그대로 | 머리 0002 ("축소는 곧 자름 → 되돌리기 거부") | DB | backend/tests/db/a16-down.integration.test.js |

### 백엔드 — DB: 새 표 두 개의 모양 (12)

이 표는 0033 `game_desertions`·0034 `game_settings`의 칸·빈 값·기본값·목차·겹치면 안 되는 묶음을 진짜 표에서 보는 케이스임.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-181 | 탈주 기록 표 칸 6개 | 끝까지 올린 DB `describeTable('game_desertions')` → 칸이 정확히 `id`(BIGINT, 기본 키, 자동 증가)·`user_id`(CHAR(36))·`game_id`(CHAR(36))·`reason`(VARCHAR(30))·`deserted_at`(DATETIME)·`blocked_until`(DATETIME) | 고치기 4장 | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-182 | 탈주 기록 칸은 다 꼭 있어야 함 | 칸 6개 모두 NULL 허용 아님 / (`user_id` 빈 채 넣기 → 거절) (`blocked_until` 빼고 넣기 → 거절) (`reason` 빈 값 → 거절) | 고치기 4장 (칸 정의), 결정「탈주 벌」(탈주 시각부터 셈 → 시각 칸 필요) | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-183 | [지금 동작] 탈주 시각을 안 주면 넣기 거절 | `deserted_at` 빼고 넣기 → DB가 거절, 줄 안 생김 (DB 기본값이 없음 — 탈주를 적는 코드는 늘 시각을 줌) | 출처 없음 (고치기 4장은 칸 종류만 적음), 모음 글 "목록이 틀려 보이는 곳" A16-B-183 | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-184 | 이유 칸은 30자까지 | `reason` `LEFT_ALIVE` → 들어감 / 31자 → 거절(너무 김) | 고치기 4장 (`reason` STRING 30: `LEFT_ALIVE`·`DISCONNECT_TIMEOUT`) | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-185 | 탈주 기록 목차 3개 | `showIndex` → `game_desertions_user_game_unique`(`user_id`,`game_id` 차례, 유일) · `game_desertions_user_deserted_idx`(`user_id`,`deserted_at`, 유일 아님) · `game_desertions_blocked_until_idx`(`blocked_until`, 유일 아님) | 고치기 4장 (목차 3개) | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-186 | [단위 8] 한 판에 한 사람 탈주 줄 하나 | 같은 `user_id`·`game_id`로 SQL 직접 두 번 → 두 번째 겹침 거절(`game_desertions_user_game_unique`), 줄 1개 | 단위 8, 결정「탈주 벌」, 고치기 4장 ("한 판 한 줄") | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-187 | 같은 사람이라도 다른 판이면 줄 둘 | 같은 `user_id`, `game_id` 둘 → 2줄 | 고치기 4장 ("한 판 한 줄"), 결정「탈주 벌」(횟수를 셈) | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-188 | 탈주 기록 사람 칸은 회원 표와 이어짐 | `users`에 없는 uuid로 넣기 → 외래키 거절 | 고치기 4장 (`user_id` → `users.uuid`) | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-189 | 판 칸은 판 기록과 안 이음 | `game_results`에 없는 판 uuid로 넣기 → 들어감 (판 도중에 적으니까) | 고치기 4장 ("판 기록 표와 안 이음 — 0008과 같은 까닭") | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-190 | 판 설정 값 표 칸 4개·빈 값 | `describeTable('game_settings')` → 칸이 정확히 `key`(VARCHAR(60), 기본 키)·`value_int`(INT, 빈 값 안 됨)·`updated_at`(DATETIME, 빈 값 안 됨)·`updated_by`(CHAR(36), 빈 값 됨) / `value_int` 빈 값으로 넣기 → 거절 | 고치기 4장 (`updated_by` "빈 값 됨") | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-191 | 같은 값 이름은 한 줄만 | 끝까지 올린 DB에 `key` `GAME_GOLD_REWARD` 한 줄 더 넣기 → 기본 키 겹침 거절, 줄 1개·값 1 그대로 | 고치기 4장 ("운영 값 한 줄씩", `key` 기본 키) | DB | backend/tests/db/a16-new-tables.integration.test.js |
| A16-B-192 | 바꾼 관리자 칸은 관리자 표와 안 이음 | `updated_by` = `admin_users`에 없는 uuid로 바꾸기 → 들어감 | 머리 0034 ("관리자 지워도 기록 남게 외래 키 안 검") | DB | backend/tests/db/a16-new-tables.integration.test.js |

### 백엔드 — DB: 표마다 겹치면 안 되는 것 (46)

이 표는 표마다 "겹치면 안 되는 것"이 진짜로 DB에서 막히는지(201~241), 문서가 "겹쳐도 됨"이라 한 것은 들어가는지(242~246) 보는 케이스임. 끝까지 올린 DB에 부모 줄(회원 둘 `민수`·`지유` 등)을 먼저 넣고 SQL로 직접 넣음. 줄마다 기대는 맨 위 "겹침 거절" 뜻 그대로(두 번째 막힘·목차 이름·줄 1개).

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-201 | 같은 메일로 두 계정 안 됨 | `users` 다른 닉네임·같은 `email` 두 줄 → 두 번째 겹침 거절 | ERD users (`email` 로그인 아이디) | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-202 | 같은 닉네임 두 계정 안 됨 | `users` 다른 메일·같은 `nickname` → 겹침 거절 | ERD users (`nickname` 사람 알아보는 이름) | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-203 | 옛 로그인 유지 토큰 해시는 하나만 | `refresh_token_history` 세션 둘에 같은 `token_hash` → 겹침 거절(`refresh_token_history_token_hash_unique`) | ERD refresh_token_history | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-204 | 같은 약관 버전에 같은 사람 동의는 한 줄 | `user_terms_agreements` 같은 `user_id`·`terms_version_id` 두 번 → 겹침 거절(`user_terms_agreements_user_version_unique`) | ERD user_terms_agreements | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-205 | 같은 종류·같은 버전 약관은 하나 | `terms_versions` (`TERMS`, `1.0`) 두 번 → 겹침 거절(`terms_versions_kind_version_unique`) / (`PRIVACY`, `1.0`) → 들어감 | ERD terms_versions (`kind`+`version` 묶음) | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-206 | 마이그레이션 이력은 이름마다 한 줄 | `schema_migrations`에 `0034-add-game-settings` 줄 하나 더 넣기 → 겹침 거절, 줄 1개 | ERD schema_migrations, 복구 머리 | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-207 | 소셜 계정 하나는 한 회원에만 | `external_identities` 회원 둘에 같은 (`provider`, `subject`) → 겹침 거절(`external_identities_provider_subject_unique`) | ERD external_identities ("남의 계정으로 들어가게 됨") | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-208 | 소셜 로그인 확인표는 한 번 왕복에 하나 | `oauth_states` 같은 `state_hash` → 겹침 거절(`oauth_states_state_hash_unique`) | ERD oauth_states | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-209 | 소셜 가입 대기표로 가입은 한 번 | `social_signup_intents` 같은 `intent_token_hash` → 겹침 거절(`social_signup_intents_token_hash_unique`) | ERD social_signup_intents | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-210 | 메일 인증 확인표는 주소·목적마다 한 줄 | `signup_email_verifications` 같은 (`email`, `purpose`) → 겹침 거절(`signup_email_verifications_email_purpose_unique`) / 같은 메일·다른 목적 → 들어감 | ERD signup_email_verifications | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-211 | 가입 증명은 한 번만 | `signup_email_verifications` 다른 메일 둘에 같은 `proof_hash` → 겹침 거절(`signup_email_verifications_proof_hash_unique`) | ERD signup_email_verifications ("가입 증명 하나는 한 번만") | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-212 | 비번 재설정 링크 하나는 한 줄 | `password_reset_tokens` 같은 `token_hash` → 겹침 거절(`password_reset_tokens_token_hash_unique`) | ERD password_reset_tokens | DB | backend/tests/db/a16-unique-account.integration.test.js |
| A16-B-213 | 같은 판 기록 두 번 안 됨 | `game_results` 같은 `id` 두 번 → 기본 키 겹침 거절, 줄 1개 | ERD game_results ("같은 판 통계 두 번 더하기 막기") | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-214 | 한 판에 같은 사람 결과 한 줄 | `game_result_players` 같은 (`game_id`, `user_id`) → 기본 키 겹침 거절 | ERD game_result_players | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-215 | 같은 판·같은 날·같은 사람 투표 참여는 한 번 | `vote_participations` 같은 (`game_id`, `day_index`, `user_id`) → 겹침 거절(`vote_participations_game_day_user_unique`) / `day_index`만 다름 → 들어감 | ERD vote_participations | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-216 | 한 사람에 통계 한 줄 | `user_stats` 같은 `user_id` 두 줄 → 기본 키 겹침 거절 | ERD user_stats | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-217 | 같은 업적은 한 번만 받음 | `achievement_grants` 같은 (`user_id`, `achievement_id`) → 겹침 거절(`achievement_grants_user_achievement_unique`) | ERD achievement_grants ("보상도 안 줌") | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-218 | 한 사람에 지갑 하나 | `economy_wallets` 같은 `user_id` 두 줄 → 기본 키 겹침 거절 | ERD economy_wallets | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-219 | 같은 요청 번호로 장부 두 줄 안 됨 | `economy_ledger_entries` 같은 사람·같은 `reference_event_id`(예 `topup:<주문 id>`) 두 줄 → 겹침 거절(`economy_ledger_entries_user_reference_unique`), 줄 1개 | ERD economy_ledger_entries ("같은 일로 두 번 돈이 움직이는 것 막음") | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-220 | 같은 구매 요청 번호는 한 번 | `economy_purchase_requests` 같은 (`user_id`, `reference_event_id`) → 겹침 거절(`economy_purchase_requests_user_reference_unique`) | ERD economy_purchase_requests | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-221 | 같은 아이템 두 번 가지기 안 됨 | `economy_entitlements` 같은 (`user_id`, `item_id`) → 겹침 거절(`economy_entitlements_user_item_unique`) | ERD economy_entitlements | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-222 | 장착 줄은 한 사람 하나 | `economy_loadouts` 같은 `user_id` 두 줄 → 기본 키 겹침 거절 | ERD economy_loadouts | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-223 | 이모티콘 8칸 줄은 한 사람 하나 | `economy_emoji_palettes` 같은 `user_id` 두 줄 → 기본 키 겹침 거절 | ERD economy_emoji_palettes | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-224 | 상품 id는 하나 | `economy_currency_products` 같은 `product_id` 두 줄 → 기본 키 겹침 거절 | ERD economy_currency_products | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-225 | 같은 결제 번호로 두 주문 안 됨 | `economy_topup_orders` 주문 둘에 같은 `payment_key` → 겹침 거절(`economy_topup_orders_payment_key_unique`) | ERD economy_topup_orders ("결제 한 건으로 두 주문에 다이아 받는 것 막음") | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-226 | 같은 두 사람 사이 기다리는 친구 신청은 하나 (같은 방향) | `friend_requests` 민수→지유 `PENDING` 두 줄 → 두 번째 겹침 거절(`friend_requests_pending_pair_unique`) | ERD friend_requests ("PENDING 신청은 하나만") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-227 | 반대 방향 기다리는 신청도 막힘 | 민수→지유 `PENDING` 있음 + 지유→민수 `PENDING` → 겹침 거절(같은 목차) | ERD friend_requests ("누가 보냈든 같은 짝", 조심할 곳 "서로 동시에 신청해 친구 줄 둘 막기") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-228 | 같은 두 사람 친구 줄 하나 | `friendships` 같은 (`requester_id`, `receiver_id`) 두 줄 → 겹침 거절(`friendships_requester_receiver`) | ERD friendships | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-229 | 같은 사람 두 번 차단 안 됨 | `friend_blocks` 같은 (`owner_id`, `blocked_id`) → 겹침 거절(`friend_blocks_owner_blocked_unique`) | ERD friend_blocks ("풀 때 하나만 지워져 차단이 남음") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-230 | 같은 친구 즐겨찾기 두 번 안 됨 | `friend_favorites` 같은 (`owner_id`, `friend_id`) → 겹침 거절(`friend_favorites_owner_friend_unique`) | ERD friend_favorites | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-231 | 초대 순번은 겹치지 않음 | `game_invites` 다른 초대 둘에 같은 `creation_seq` → 겹침 거절(`game_invites_creation_seq_unique`) | ERD game_invites ("겹치면 순서가 꼬임") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-232 | 같은 초대 요청이 두 번 와도 초대 하나 | `game_invites` 같은 (`sender_id`, `creation_key`) → 겹침 거절(`game_invites_sender_key_unique`) | ERD game_invites ("버튼 두 번·다시 보내기") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-233 | 같은 일로 알림 두 번 안 됨 | `notifications` 같은 (`user_id`, `source_key`) → 겹침 거절(`notifications_user_source_unique`) / 다른 사람·같은 `source_key` → 들어감 | ERD notifications | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-234 | 접속 상태는 한 사람 한 줄 | `online_presence` 같은 `user_id` 두 줄 → 기본 키 겹침 거절 | ERD online_presence | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-235 | 같은 판·같은 대상 신고는 한 번 | `reports` 같은 (`reporter_id`, `target_id`, `game_id`) → 겹침 거절(`reports_reporter_target_game_unique`) / 다른 판 → 들어감 | ERD reports | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-236 | 같은 금지어 두 줄 안 됨 | `banned_words` 같은 `word` → 겹침 거절(`banned_words_word_unique`) | ERD banned_words | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-237 | 같은 쿠폰 코드 두 개 안 됨 | `coupons` 같은 `code` → 겹침 거절(`coupons_code_unique`) | ERD coupons | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-238 | 한 사람 한 쿠폰 한 번 | `coupon_redemptions` 같은 (`coupon_id`, `user_id`) → 겹침 거절(`coupon_redemptions_coupon_user_unique`) | ERD coupon_redemptions | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-239 | 관리자 로그인 아이디는 하나 | `admin_users` 같은 `login_id` → 겹침 거절(`admin_users_login_id_unique`) | ERD admin_users | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-240 | 관리자 메일은 한 사람만 | `admin_users` 다른 아이디 둘에 같은 `email` → 겹침 거절(`admin_users_email_unique`) | ERD admin_users ("클라우드플레어 Access 메일과 맞춰 보는 칸") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-241 | 문의 답 요청 번호는 표 전체에서 하나 | `inquiry_replies` 문의 둘에 같은 `request_id` → 겹침 거절(`inquiry_replies_request_id_unique`) | ERD inquiry_replies ("다른 문의에 같은 번호를 쓰면 거절") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-242 | 결제 번호가 빈 주문은 여러 줄 됨 | `economy_topup_orders` `payment_key` 빈 값(`CREATED`) 주문 3줄 → 다 들어감 | ERD economy_topup_orders ("빈 값 줄(CREATED)은 여러 개 있어도 됨") | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-243 | 끝난 친구 신청은 같은 짝 여러 줄 됨 | 민수→지유 `DECLINED` 2줄 + `CANCELLED` 1줄 + 새 `PENDING` 1줄 → 4줄 다 들어감, `pending_pair_key`는 `PENDING` 줄만 채워짐(작은 uuid `:` 큰 uuid), 나머지 빈 값 | ERD friend_requests 조심할 곳 (계산 규칙·끝난 신청은 몇 줄이든 남음) | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-244 | 관리자 메일이 빈 줄은 여러 개 됨 | `admin_users` `email` 빈 값 두 줄(아이디는 다름) → 둘 다 들어감 | ERD admin_users ("빈 값은 여러 줄 가능") | DB | backend/tests/db/a16-unique-social-ops.integration.test.js |
| A16-B-245 | 장부 요청 번호는 사람마다 따로 | 민수·지유가 같은 `reference_event_id`로 장부 한 줄씩 → 둘 다 들어감 | ERD economy_ledger_entries (막는 묶음 = `user_id` + `reference_event_id`) | DB | backend/tests/db/a16-unique-game-economy.integration.test.js |
| A16-B-246 | 세션 갱신 해시는 일부러 유일 아님 | `user_sessions` 세션 둘에 같은 `refresh_token_hash` → 둘 다 들어감 / 목차 `user_sessions_refresh_token_hash`·`user_sessions_refresh_previous_hash`는 있음(유일 아님) | ERD user_sessions, DB변경 D-03·"애매해서 안 한 것" 0021 (겹치면 로그인이 풀려서 유일 안 검) | DB | backend/tests/db/a16-unique-account.integration.test.js |

### 백엔드 — DB: 외래키 걸린 곳·안 걸린 곳 (7)

이 표는 외래키(다른 표와 잇는 칸)가 문서에 "걸림"이라 한 곳에만 있고, "안 걸림"이라 한 곳은 없는 값도 받는지 보는 케이스임.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-251 | 외래키 전체 목록이 문서와 같음 | 끝까지 올린 DB의 `INFORMATION_SCHEMA.KEY_COLUMN_USAGE`(외래키만) → (표.칸 → 부모 표.칸) 목록이 아래 부록 2 "외래키 44개"와 정확히 같음 (더도 덜도 없음), `oauth_states.user_id` 외래키 이름은 `oauth_states_ibfk_1` | ERD 표마다 "이어지는 표", 고치기 4장 (0033 `user_id` → `users.uuid`), DB변경 D-02 (이름 `oauth_states_ibfk_1`) | DB | backend/tests/db/a16-foreign-keys.integration.test.js |
| A16-B-252~255 | 문서가 "안 걸림"이라 한 칸은 없는 값도 받음 | 끝까지 올린 DB, 부모 줄 없이 넣기 (값 4): (`vote_participations.game_id` = 없는 판 → 들어감) (`reports.game_id` = 없는 판 + `handled_by_admin_id` = 없는 관리자 → 들어감) (`oauth_states.session_id` = 없는 세션 → 들어감) (`economy_topup_orders.product_id` = 없는 상품 → 들어감) | ERD vote_participations·game_results (판 진행 중에 적음), ERD reports ("판 저장 전에도 신고 받으려고"), ERD oauth_states ("세션은 끊겨도 줄이 남아서 일부러 안 걺"), ERD economy_topup_orders ("코드만 그렇게 씀") | DB | backend/tests/db/a16-foreign-keys.integration.test.js |
| A16-B-256 | 신고를 지우면 채팅 증거도 같이 지워짐 | `reports` 1줄 + `report_chat_evidence` 2줄 → 그 신고 줄 지움 → 증거 0줄 | ERD report_chat_evidence ("신고 줄이 지워지면 같이 지워짐(CASCADE)") | DB | backend/tests/db/a16-foreign-keys.integration.test.js |
| A16-B-257 | 문의를 지우면 답도 같이 지워짐 | `inquiries` 1줄 + `inquiry_replies` 2줄 → 그 문의 지움 → 답 0줄 | ERD inquiry_replies ("`onDelete: CASCADE`, 0032") | DB | backend/tests/db/a16-foreign-keys.integration.test.js |

### 백엔드 — DB: 모델과 실제 표 (4)

이 표는 코드 속 표 정의(모델)와 마이그레이션으로 만든 진짜 표가 같은 모양인지 보는 케이스임.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-261 | 모델 표 + 모델 없는 표 = DB 표 | 모델마다 `tableName` 47개 + `refresh_token_history`·`schema_migrations` → 끝까지 올린 DB의 표 49개와 정확히 같음 | ERD 양식 ("모델 없는 표 2개"), DB변경 "모델" 줄 (세 곳이 같은 모양), 단위 8 (모델 2개 새로·등록) | DB | backend/tests/db/a16-model-match.integration.test.js |
| A16-B-262 | 모델마다 칸 이름이 표와 같음 | 모델 47개 각각 칸 이름 목록 = `describeTable` 칸 이름 목록, 예외는 `friend_requests.pending_pair_key` 하나(DB에만 있는 계산 칸) | DB변경 "모델" 줄, ERD friend_requests 조심할 곳 ("모델엔 없고 0013이 만듦") | DB | backend/tests/db/a16-model-match.integration.test.js |
| A16-B-263 | 모델마다 빈 값 허용이 표와 같음 | 모델 47개 칸마다 `allowNull`(안 적으면 허용, 기본 키는 아님) = DB NULL 허용 | DB변경 D-11 (모델 NOT NULL을 DB와 맞춤), "모델" 줄 | DB | backend/tests/db/a16-model-match.integration.test.js |
| A16-B-264 | 모델에 적은 목차가 표에 같은 모양으로 있음 | 모델 `indexes`에 이름이 적힌 목차마다 DB에 같은 이름·같은 칸 차례·같은 유일 여부로 있음 (예 `game_desertions` 3개, `user_sessions` 해시 2개, `oauth_states_state_hash_unique`) | DB변경 "모델" 줄 ("인덱스 이름·새 인덱스를 모델에도 같게"), 고치기 4장 | DB | backend/tests/db/a16-model-match.integration.test.js |

### 백엔드 — DB: 시험 DB 도우미 (6)

이 표는 다른 DB 시험이 다 쓰는 도우미 `isolatedTestDb.js`가 표를 지우고 비우는 순서·막는 것을 보는 케이스임.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-271 | 표 다 지우기는 자식 표부터 | 끝까지 올린 DB + 자식 줄(`game_desertions`→`users`, `coupon_redemptions`→`coupons`, `inquiry_replies`→`inquiries`, `report_chat_evidence`→`reports`, `user_terms_agreements`→`terms_versions`, `refresh_token_history`→`user_sessions`) 넣음 → `resetManagedSchema` → 외래키 오류 없음, 표 0개 | 도우미 ("지울 때 자식 표 먼저"), 단위 8 (도우미 표 목록) | DB | backend/tests/db/a16-test-db-helper.integration.test.js |
| A16-B-272 | 관리 목록이 새 표 두 개를 앎 | 끝까지 올린 DB → `assertNoUnknownTables(관리 목록)` 통과, `buildManagedSchema` 관리 목록에 `game_desertions`·`game_settings` 있음 | 단위 8 ("시험 DB 준비에 들어감") | DB | backend/tests/db/a16-test-db-helper.integration.test.js |
| A16-B-273 | 줄 비우기는 처음 값 세 표를 남김 | B-271과 같은 줄 넣음 → `resetManagedData` → `cleaned` true, `maintenance_state` 1줄·`terms_versions` 2줄·`game_settings` `GAME_GOLD_REWARD` 1 그대로, 그 밖 표 0줄, `deleted` 목록에서 `game_desertions`가 `users`보다 앞 | 도우미 ("처음 값 넣어 두는 표는 행 비우기에선 뺌"·자식 먼저), 단위 8 | DB | backend/tests/db/a16-test-db-helper.integration.test.js |
| A16-B-274 | 허락 안 된 DB 이름이면 아무것도 안 지움 | 주소의 DB 이름만 `joker`로 바꾼 글자로 `resetManagedSchema` → 오류 "전용 테스트 DB 대상이 아닙니다", 시험 DB 표 49개 그대로 | 도우미·계획 4-5 (허락된 이름 2개 말고는 지우기 거부), setup-test-db 머리 | DB | backend/tests/db/a16-test-db-helper.integration.test.js |
| A16-B-275 | 모르는 표가 있으면 거절 | 시험 DB에 표 `zz_a16_unknown` 만듦 → `resetManagedSchema` → 오류 "관리 목록이 모르는 테이블", 표 50개 그대로 (끝나면 그 표만 지움) | 도우미 ("전용 테스트 DB가 맞는지 확인 — 진행 거부") | DB | backend/tests/db/a16-test-db-helper.integration.test.js |
| A16-B-276 | [지금 동작] 표가 덜 올라간 DB는 줄 비우기 안 함 | 0033까지 올린 DB → `resetManagedData` → `cleaned` false, `missingTables` = [`game_settings`], 어느 표도 안 비움 | 출처 없음 (도우미 코드뿐) | DB | backend/tests/db/a16-test-db-helper.integration.test.js |

### 백엔드 — DB: 데이터 지키는 멈춤 (5)

이 표는 옛 마이그레이션이 "짐작하지 않고 멈춤"이라 적은 곳이 진짜로 멈추고 데이터를 안 건드리는지 보는 케이스임.

| 번호 | 무엇을 확인하나 | 주는 것 → 기대하는 것 | 정답의 출처 | 종류 | 파일 |
|---|---|---|---|---|---|
| A16-B-281 | 기준선 표가 일부만 있으면 멈춤 | 빈 DB에 기준선 14표 중 `users`·`login_history`만 만듦 → `applyMigrations` → 0001 오류 "14개 테이블 중 일부(2개)만 존재", 0001 줄 `failed`, 새 표 안 생김 | 머리 0001 ("일부만 존재하면 에러로 멈춘다"), 복구 3 | DB | backend/tests/db/a16-data-guard.integration.test.js |
| A16-B-282 | [지금 동작] 같은 모양 기준선 표가 이미 있어도 0001이 멈춤 | 0001만 올림 → `schema_migrations` 표 지움(이력 없음 = sync로 만든 DB 흉내) → `applyMigrations` → 0001이 "기존 DB 구조가 F-01 기준선과 다릅니다"로 멈춤(이력 `failed`). 걸리는 것은 시각 칸 8곳의 DB 기본값뿐(`account_find_requests.created_at`·`password_reset_tokens.created_at`·`user_sessions.connected_at`·`user_bans.created_at`·`login_history.login_at`·`online_presence.last_active_at`·`friend_requests.created_at`·`traffic_logs.accessed_at` — 기대 `CURRENT_TIMESTAMP` / 실제 없음), 넣어 둔 줄은 그대로 | 모음 글 C-029 (있는 마이그레이션 파일은 안 고침 — 이미 0001을 지난 DB는 영향 없음, `docs/배포_설정.md` 9-9), 머리 0001 ("구조가 다르면 에러로 멈춘다") | DB | backend/tests/db/a16-data-guard.integration.test.js |
| A16-B-283 | 기준선과 모양이 다르면 멈춤 | B-282처럼 만든 뒤 `users`에 칸 하나 더 함 → `applyMigrations` → 0001 오류(구조 다름), `users` 칸·줄 그대로 | 머리 0001 ("구조가 다르면 에러로 멈춘다"), 복구 3 ("sync로 만든 DB는 0001 구조 비교에서 거부될 수 있음") | DB | backend/tests/db/a16-data-guard.integration.test.js |
| A16-B-284 | 0020: 없는 계정을 가리키는 줄이 있으면 멈춤 | 0019까지 올림 → `oauth_states_ibfk_1` 외래키를 떼고 없는 `user_id` 줄 하나 넣음 → 0020 올림 → 오류, 그 줄 안 지움, 외래키 안 생김 | DB변경 D-02 ("고아 행 있으면 지우지 않고 멈춤"), 머리 0020 | DB | backend/tests/db/a16-data-guard.integration.test.js |
| A16-B-285 | 0028: 지울 칸에 값이 있으면 아무것도 안 지움 | 0027까지 올림 → `users.phone`에 값 하나 → 0028 올림 → 오류 "값이 1개 있어 안 지움", `users.phone`·`user_sessions.last_ping_at`·`online_presence.current_room_id`·`traffic_logs` 다 그대로 | DB변경 0028 ("값이 하나라도 있으면 아무것도 안 지우고 멈춤 — 반쯤 지운 채로 안 멈추게 먼저 다 봄") | DB | backend/tests/db/a16-data-guard.integration.test.js |

## 개수 확인

이 표는 층마다 줄 수(범위는 값 수)를 다시 센 것임.

| 층 | 번호 범위 | 개수 | 목표 |
|---|---|---|---|
| 백 순수 | B-001~020 | 20 | |
| 백 DB 끝까지 올리기 | B-101~108 | 8 | |
| 백 DB 다시 올림 | B-111~117 | 7 | |
| 백 DB 실패·다시 하기 | B-121~132 (프로세스 2) | 12 | |
| 백 DB 잠금 | B-141~144 | 4 | |
| 백 DB 바뀐 마이그레이션 | B-151~153 | 3 | |
| 백 DB 준비 검사 | B-161~167 | 7 | |
| 백 DB 되돌리기 | B-171~179 | 9 | |
| 백 DB 새 표 모양 | B-181~192 | 12 | |
| 백 DB 겹치면 안 되는 것 | B-201~246 (막힘 41 + 겹쳐도 됨 5) | 46 | |
| 백 DB 외래키 | B-251~257 | 7 | |
| 백 DB 모델 | B-261~264 | 4 | |
| 백 DB 시험 DB 도우미 | B-271~276 | 6 | |
| 백 DB 데이터 지키는 멈춤 | B-281~285 | 5 | |
| **백 합** | | **150** (순수 20 · DB 130) | **150** |
| 화·모·브 | 없음 | 0 | 0 |

- 계획 2-5 A16 칸 "순수 20 · DB 130"과 같음.
- 번호 겹침 0: 구간마다 번호대가 다름(001~020, 101~, 111~, 121~, 141~, 151~, 161~, 171~, 181~, 201~, 251~, 261~, 271~, 281~).
- 계획 2-5 "마이그레이션 0001~0034마다 두 번 돌림·down(뜻 있는 것만)": 34개 하나하나를 두 번 돌리는 줄은 안 둠 — 전체를 한 번 더 올리는 B-111·112가 34개 모두를 지나가고, 처음 값·관리자 값이 걸린 0024·0033·0034만 따로 둠(B-113~117). down은 데이터를 잃거나 남의 것까지 지울 수 있는 9개만(B-171~179).
- 시간: B-141은 잠금 기다림 30초를 진짜로 기다림 → 잠금 파일 하나에 몰아 둠. 나머지는 빈 DB에 34개 올리기가 대부분 시간 — 파일마다 `before`에서 한 번 올리고 줄만 비우며 쓰는 것을 (나) 에이전트에 권함.
- 판을 안 차리므로 운영 인원(5~10) 규칙은 이 영역에 해당 없음.

## 결정 대기·출처 없음

| 번호 | 무엇 | 왜 |
|---|---|---|
| A16-B-183 | 탈주 시각 칸을 안 주면 DB가 거절함 | 고치기 4장은 `deserted_at`(DATE)만 적고 기본값은 안 적음. 지금 동작(DB에 기본값이 안 생겨 넣기 실패, 코드는 늘 값을 줌)을 임시 정답으로 |
| A16-B-276 | 표가 덜 올라간 DB면 줄 비우기를 안 함 | 도우미 코드뿐, 주석·문서 없음 |
| A16-B-005 | 함수 밖 "처음 넣는 값"이 바뀐 것은 체크섬이 못 알아챔 | 모음 글 C-028. 셈법을 바꾸면 이미 적용한 34개 체크섬이 전부 달라져 운영 DB가 "바뀜"으로 멈출 수 있어 안 고침 → 지금 동작을 정답으로, 사용자에게 알림 |
| A16-B-282 | 표 14개가 이미 있고 이력이 없는 DB는 0001에서 멈춤 | 모음 글 C-029. 있는 마이그레이션 파일은 안 고치는 규칙 → 지금 동작을 정답으로. 이미 0001을 지난 DB는 영향 없음 (`docs/배포_설정.md` 9-9) |
| (번호 없음) | `friendships` (A,B)·(B,A) 두 줄을 DB가 못 막음 | DB변경 D-12 "낮음이라 보류". 막혀야 하는지 정해지지 않아 케이스 안 둠 (지금 앱이 잠금으로 막음 — A13 몫) |
| (번호 없음) | `user_bans` 한 사람 정지 두 줄을 DB가 못 막음 | ERD user_bans "DB 제약은 없음, 코드가 막음" — DB 쪽은 막는 것이 없다는 뜻이라 여기서 안 봄, 코드 막음은 A14 몫 |
| (번호 없음) | 되돌리기(down)를 부르는 명령이 없음 | `migrate-db.js`는 `status`·`migrate`·`resolve-failure`만. 운영은 백업 복원(복구 2장 A). down 시험은 함수 직접 부름 — 명령을 둘지 사용자 결정 |
| (번호 없음) | `users.email` 대소문자만 다른 메일을 같은 메일로 볼지 | 문서에 없음, 시험 DB 문자 정렬(`utf8mb4_unicode_ci`)에 따라 달라짐 → 케이스 안 둠 |

- `[지금 동작]` 케이스 수: 4 / 150 (약 3%) — 20% 아래. (B-005·183·276·282)
- 머리 주석·실행기 주석을 출처로 쓴 줄이 많음(부탁 글이 출처로 지정). 결정.md에 없는 내용이라 "코드가 스스로 한 약속"을 정답으로 본 것 — 주석과 코드가 다르면 시험이 실패해 드러남.

## 받은 버그 케이스 확인

| 버그 | 번호 |
|---|---|
| 받은 버그 1~9 | A16 영역에 걸린 것 없음 (시험_계획 2-6 표에 A16 줄 없음) |

## 고치기_계획 "꼭 넣을 케이스" 확인

이 표는 `고치기_계획.md` 단위 8의 꼭 넣을 케이스가 어느 번호에 들어갔는지 보여 줌.

| 단위 | 꼭 넣을 케이스 | 번호 |
|---|---|---|
| 8 | 빈 시험 DB에 끝까지 돌리면 두 표가 생기고 마지막 이름이 0034 | B-001, B-101, B-102 |
| 8 | 두 번 돌려도 오류 없음(있는 표·목차 건너뜀) | B-111, B-112, B-114, B-116 |
| 8 | down이면 두 표만 지워지고 다른 표는 그대로 | B-171, B-172 |
| 8 | `game_settings`에 `GAME_GOLD_REWARD = 1` 한 줄 | B-104, B-115, B-191 |
| 8 | `game_desertions`에 같은 사람·같은 판 두 번째가 막힘 | B-186 (저장소 쪽은 A09 B-416·418) |
| 8 | 등록 목록·시험 DB 준비에 들어감 | B-001, B-016, B-272, B-273 |
| 8 (A18과 겹침, 여기선 검사 함수만) | 0033·0034 안 올라간 DB에선 운영 서버가 안 켜짐 | B-161, B-162 (서버 켜기는 A18 B-302·303) |

## 글끼리 다른 곳

이 목록은 출처끼리 말이 다르거나 주석이 실제와 안 맞아 보이는 곳과 어느 쪽을 따랐는지 적음.

1. `0024-add-operations-tables.js` 머리 주석 "운영 받침 표 9개" ↔ 같은 파일 `TABLES` 목록은 8개(`reports`·`report_chat_evidence`·`banned_words`·`maintenance_state`·`admin_users`·`admin_audit_logs`·`coupons`·`coupon_redemptions`), ERD 글도 8개. 표 49개 셈은 8개로 함(B-102). 주석 고칠 일.
2. `0002-expand-nickname-snapshot.js` 머리 "down()은 50자를 넘는 기존 데이터가 있으면 … 거부" ↔ 같은 주석 뒷줄 "축소는 곧 자름". 30자로 줄이면 31자부터 잘리므로 "30자 넘는 값이 있으면 거부"를 정답으로 봄(B-179). 머리 글의 "50자"는 잘못 적은 것으로 보임 [짐작].
3. `docs/DB_변경_2026-11-09.md` 개발 DB 비움 절 "마이그레이션 0001~0029 전부 applied" ↔ 지금은 0034까지. 그 글은 11/9 기준이라 그대로 두고, 표 수·이름 수는 지금 목록(34개·표 49개)으로 셈.
4. `reports/DB_ERD_설명_2026-11-15/_양식.md` "마이그레이션 0001~0032 기준" ↔ 지금 0034까지. ERD 글엔 0033·0034 표가 없어 그 두 표는 `고치기_계획.md` 4장을 출처로 씀(B-181~192).
5. 시험_계획 2-5 A16 "마이그레이션마다 두 번 돌림" ↔ 이 목록은 전체 한 번 더 올리기 + 처음 값이 걸린 셋만 따로(개수 확인 셋째 줄). 같은 뜻을 34번 늘리지 않으려는 것.

## 개발자용 부록 — 건너뛰어도 됨

### 부록 1. 표 49개 (B-102·B-261 기대값)

이 목록은 끝까지 올린 DB에 있어야 할 표 이름을 만든 마이그레이션별로 적음.

| 만든 마이그레이션 | 표 | 수 |
|---|---|---|
| 0001 기준선 (14개 중 `traffic_logs`는 0028이 지움) | `users`, `account_find_requests`, `password_reset_tokens`, `user_sessions`, `user_bans`, `user_stats`, `login_history`, `online_presence`, `friend_requests`, `friendships`, `game_results`, `game_result_players`, `concurrent_snapshots` | 13 |
| 0004 | `refresh_token_history` | 1 |
| 0005 | `external_identities`, `oauth_states`, `social_signup_intents` | 3 |
| 0006 | `economy_wallets`, `economy_ledger_entries`, `economy_entitlements`, `economy_loadouts` | 4 |
| 0007 | `economy_purchase_requests` | 1 |
| 0008 | `vote_participations` | 1 |
| 0009 | `achievement_grants` | 1 |
| 0012 | `notifications` | 1 |
| 0013 | `friend_blocks`, `friend_favorites`, `game_invites` | 3 |
| 0016 | `signup_email_verifications` | 1 |
| 0018 | `economy_currency_products`, `economy_topup_orders` | 2 |
| 0019 | `economy_emoji_palettes` | 1 |
| 0024 | `reports`, `report_chat_evidence`, `banned_words`, `maintenance_state`, `admin_users`, `admin_audit_logs`, `coupons`, `coupon_redemptions` | 8 |
| 0026 | `terms_versions`, `user_terms_agreements` | 2 |
| 0031 | `admin_sessions`, `admin_login_attempts` | 2 |
| 0032 | `inquiries`, `inquiry_replies` | 2 |
| 0033 | `game_desertions` | 1 |
| 0034 | `game_settings` | 1 |
| 실행기 | `schema_migrations` | 1 |
| **합** | | **49** |

- 모델 없는 표: `refresh_token_history`, `schema_migrations` (나머지 47개는 모델 있음).

### 부록 2. 외래키 44개 (B-251 기대값)

이 목록은 ERD 글의 "이어지는 표"에서 "DB 외래키 걸림"이라 한 것과 고치기 4장의 0033을 모은 것임. 부모가 적히지 않은 줄은 `users.uuid`.

| 표 | 칸 → 부모 |
|---|---|
| `login_history` | `user_id` |
| `user_sessions` | `user_id` |
| `refresh_token_history` | `session_id` → `user_sessions.id` |
| `user_bans` | `user_id` |
| `user_terms_agreements` | `user_id`, `terms_version_id` → `terms_versions.id` |
| `external_identities` | `user_id` |
| `oauth_states` | `user_id` (이름 `oauth_states_ibfk_1`) |
| `password_reset_tokens` | `user_id` |
| `game_result_players` | `game_id` → `game_results.id`, `user_id` (0001 기준선에 있음 — 처음 목록이 빠뜨린 것) |
| `vote_participations` | `user_id` |
| `user_stats` | `user_id` |
| `achievement_grants` | `user_id` |
| `economy_wallets` · `economy_ledger_entries` · `economy_purchase_requests` · `economy_entitlements` · `economy_loadouts` · `economy_emoji_palettes` · `economy_topup_orders` | 각 `user_id` (7개) |
| `friend_requests` · `friendships` | 각 `requester_id`, `receiver_id` (4개) |
| `friend_blocks` | `owner_id`, `blocked_id` |
| `friend_favorites` | `owner_id`, `friend_id` |
| `game_invites` | `sender_id`, `receiver_id` |
| `notifications` | `user_id` |
| `online_presence` | `user_id` |
| `reports` | `reporter_id`, `target_id` |
| `report_chat_evidence` | `report_id` → `reports.id` (지우면 같이 지움) |
| `coupon_redemptions` | `coupon_id` → `coupons.id`, `user_id` |
| `admin_sessions` | `admin_id` → `admin_users.id` |
| `admin_audit_logs` | `admin_id` → `admin_users.id` |
| `inquiries` | `user_id` |
| `inquiry_replies` | `inquiry_id` → `inquiries.id` (지우면 같이 지움), `admin_id` → `admin_users.id` |
| `game_desertions` | `user_id` |

- 안 걸린 것(문서가 "코드만"·"일부러 안 걺"): `vote_participations.game_id`, `game_desertions.game_id`, `reports.game_id`·`handled_by_admin_id`, `oauth_states.session_id`, `user_bans.banned_by`·`lifted_by`, `terms_versions.created_by_admin_id`, `banned_words.created_by_admin_id`, `maintenance_state.updated_by_admin_id`, `coupons.created_by_admin_id`, `admin_login_attempts.admin_id`, `game_settings.updated_by`, `economy_topup_orders.product_id`, `economy_ledger_entries.reference_event_id`·`item_id`, `game_invites.room_id`, `notifications.source_key`. `social_signup_intents`·`signup_email_verifications`·`account_find_requests`·`concurrent_snapshots`·`game_results`·`economy_currency_products`·`admin_users`·`schema_migrations`는 잇는 칸 없음.
- 44개 셈이 문서에서 빠뜨린 것 때문에 실제와 다르면 B-251이 실패함 → 그때 ERD 글과 마이그레이션을 같이 보고 어느 쪽이 맞는지 반장이 정함.
