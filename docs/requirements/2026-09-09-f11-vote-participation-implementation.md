# F-11 투표 참여 영속 집계 — 구현 근거 (2026-09-11)

경기·(일반 낮) 라운드·참여자 단위의 유효 투표 참여 사건을 DB에 영속 저장하고, F-12가 그 원천을
그대로 조회해 업적 진행을 판정할 수 있는 연결점을 제공한다. 새 테이블(`vote_participations`)
하나만 추가하며, 과거 경기 결과로부터 소급해서 사건을 만들어내지 않는다(A-05).

## AC별 변경

### AC-01 — 경기·라운드·참여자 단위 영속 스키마
- `backend/models/game/vote_participation.model.js`(신규): `VoteParticipation` 모델.
  `(game_id, day_index, user_id)` 복합 유일 인덱스(`vote_participations_game_day_user_unique`)를
  둔다. `game_id`는 `game_results.id`를 참조하지 **않는다** — 사건은 경기가 진행 중일 때(그
  라운드가 끝나는 즉시) 저장되므로, 저장 시점에는 아직 `game_results` 행이 없다. `user_id`만
  `users.uuid`를 참조한다.
- `backend/db/migrations/0008-add-vote-participations.js`(신규): `0007-add-economy-purchase-
  requests.js`와 같은 패턴(멱등한 `up`, 존재 확인 후 생성, `verify`, `down`)으로 테이블을
  만든다. `backend/scripts/migrate-db.js`의 `MIGRATIONS` 배열에 등록해 실제 배포 명령
  (`node backend/scripts/migrate-db.js migrate`)에서도 다른 마이그레이션과 순서대로 적용된다.
- `backend/tests/helpers/isolatedTestDb.js`(수정): `buildManagedSchema`가 `vote_participations`도
  관리 테이블 목록·드롭 순서에 기본 포함하도록 확장했다(0006/0007이 추가될 때와 같은 이유 —
  이 테이블을 모르는 다른 격리 DB 통합 스위트의 `resetSchema()`가 "모르는 테이블"로 오판해
  거부하지 않게 한다).

### AC-02 — 중복 제출·네트워크 재시도는 한 번만 반영
- `backend/repositories/voteParticipation.repositories.js#recordValidDayVoteParticipation`(신규):
  `(game_id, day_index, user_id)` 키로 `findOrCreate`를 시도하고, 경합으로 유일 제약을 직접
  건드리는 경우(동시 INSERT 충돌)는 `UniqueConstraintError`를 잡아 `{recorded:false}`로
  정규화한다 — `gameResult.repositories.js#persistGameResult`와 같은 관례(DB 제약이 멱등성의
  근거이지, 프로세스 메모리 플래그가 아니다).
- `backend/socket/gameSession.js#handleSubmitDayVote`(수정): 비기권 투표가 core 검증을 통과하면
  **성공 ack 전에** 위 저장을 `await`한다(A-03). dayIndex는 core 호출 직후·저장 이전(=라운드
  전환이 끼어들 수 없는 시점)에 읽어(`gameSessionCore.getSessionDayIndex`, 신규) 사건이 항상
  실제로 반영된 라운드로 귀속되게 한다.

### AC-03 — 기권·재판·재투표는 라운드당 1회, 중단 경기는 제외
- 집계 키는 `game_id`·`day_index`·`user_id`이고 **재투표 차수(`dayVoteRound`)는 포함하지
  않는다**(A-02). `commitDayVoteResolution`(기존, 변경 없음)이 REVOTE에서 `dayVotes`를 초기화하고
  `dayVoteRound`만 올릴 뿐 `dayIndex`는 그대로 유지하므로, 같은 낮 안의 재투표는 DB 유일 제약이
  자동으로 새 사건을 막는다 — 별도의 라운드 인지 로직이 필요 없다.
- 기권(`targetId:null`)은 `handleSubmitDayVote`가 저장을 아예 시도하지 않는다(D-09가 세는
  것은 비기권 참여뿐이다, A-01).
- TRIBUNAL 전이는 `session.dayVotes`/`day_index`를 건드리지 않으므로 그 낮의 이미 확정된
  비기권 사건 수에 영향이 없다.
- `backend/repositories/voteParticipation.repositories.js#countEligibleDayVoteParticipations`(신규):
  `completed===true && settings.gameSource.value!=='development'`인 `game_results`에 INNER
  JOIN되는 사건만 센다(A-04) — 중단 경기(`completed:false`)와 개발 경기는 업적 집계에서
  제외된다. 아직 `game_results` 행이 없는(경기 진행 중) 사건도 자연히 이 JOIN에서 빠진다.

### AC-04 — 과거 무기록은 0
- `countEligibleDayVoteParticipations`는 사건이 없는 계정에 대해 빈 배열 → `length 0`을
  돌려준다(별도의 "없으면 만든다" 분기가 없다). 마이그레이션(`0008-*.js`)은 테이블만 추가할 뿐
  과거 `game_result_players` 기록을 `vote_participations`로 변환하는 backfill을 전혀 하지
  않는다(A-05) — 과거 투표 이력은 존재한 적이 없으므로 0으로 남는다.

### AC-05 — F-12 연결점
- `voteParticipationRepository.countEligibleDayVoteParticipations(userId)`가 F-12가 재사용할
  단일 조회 함수다. `roleStatisticsPolicy`(F-10)가 이미 확립한 "저장소 함수 하나가 판정 원천"
  관례와 동일한 모양이다.

### AC-06 — 자동 시험·회귀·빌드
- `backend/tests/voteParticipation.persistence.test.js`(신규): `F01_TEST_DATABASE_URL` 전용
  격리 MySQL에서 실제 유일 제약·동시 경합·저장 실패 재시도·재접속(uuid 기준 집계)·재투표·
  TRIBUNAL 전이·중단 경기 제외·개발 경기 제외·과거 무기록 0건·F-12 조회 계약·마이그레이션
  재실행 안전성을 검증한다(아래 "실행 결과" 참고 — 이 세션에는 격리 DB 접근 권한이 없어
  스킵으로 종료됐다).
- `backend/socket/__tests__/gameSession.test.js`(수정): `handleSubmitDayVote`가 async로 바뀌면서
  성공 ack가 await 이후로 밀리는 3개 테스트(정상 투표·위조 필드 방어·`registerGameHandlers`
  배선 확인)를 `async`/`await`로 갱신했다. 나머지 30여 개 호출부(실패 경로 또는 응답을 검사하지
  않는 설정용 호출)는 core 검증 실패 시 `await` 이전에 반환하거나, 어차피 응답을 확인하지
  않으므로 수정하지 않았다 — `test.beforeEach`에 저장소 호출을 즉시 성공 스텁으로 갈아끼우는
  전역 오버리이드(`__setRecordVoteParticipationForTests`, 신규 testable)를 추가해 이 파일이
  실제 DB 없이 ack 타이밍·payload 계약만 검증하게 했다.

## 스키마·FK 설계 판단

사건은 경기 진행 **중**(그 낮 라운드가 끝나는 즉시) 저장되므로, 저장 시점에는 `game_results`
행이 아직 없다(경기 종료 시에만 생긴다). 그래서 `game_id`에 `game_results.id`를 향한 외래키를
걸지 않았다 — 걸었다면 매 투표 저장이 아직 존재하지 않는 부모 행을 참조하려다 실패했을 것이다.
집계 시점(`countEligibleDayVoteParticipations`)에만 `game_results`와 JOIN해 완료·출처를
판정한다. `user_id`는 항상 먼저 존재하는 `users.uuid`를 참조하므로 그대로 FK를 걸었다.

## 복구 절차

이 기능은 `0008-add-vote-participations.js` 마이그레이션 하나로 테이블을 추가할 뿐, 기존 테이블의
컬럼을 바꾸거나 데이터를 변형하지 않는다. 실패 시 복구는 기존 F-01 migration
runbook(`docs/requirements/2026-09-09-f01-migration-runbook.md`)의 절차(`migrate-db.js status` →
실패 이력 확인 → 필요 시 백업 복원 → `resolve-failure --confirm`)를 그대로 따른다. `down`은
테이블을 그대로 드롭하므로, 이미 쌓인 투표 참여 이력을 보존해야 한다면 드롭 전에 별도 백업이
필요하다(이 마이그레이션 자체는 그런 백업을 자동으로 만들지 않는다 — 0001~0007과 동일한 수준).

재실행 안전성: `up`은 `showAllTables()`로 존재 여부를 먼저 확인하므로, 이미 적용된 뒤 다시
`applyMigrations`를 호출해도 `migrationRunner`의 `applied` 이력 게이트에 의해 스킵된다(체크섬이
바뀌지 않는 한).

## 실행 결과

- `node impl-check.js node-test backend/game-core/__tests__/gameSession.dayVote.test.js`:
  **84/84 통과**(game-core는 이번 변경으로 `submitDayVote`의 반환 계약을 건드리지 않았으므로
  전부 그대로 통과 — `getSessionDayIndex`는 별도 함수로 추가했다).
- `node impl-check.js node-test backend/socket/__tests__/gameSession.test.js`: **168/168
  통과**(async화된 `handleSubmitDayVote`와 전역 저장소 스텁 포함).
- `node impl-check.js node-test backend/tests/voteParticipation.persistence.test.js`: **12개 전부
  skip**(fail 아님) — `F01_TEST_DATABASE_URL`이 이 세션에 주입되지 않았다. 이 저장소에는
  `pluto_f01_20260909_al`이라는 승인된 전용 격리 MySQL 스키마 이름이 있고(운영자 wrapper가
  자격 증명을 주입), 이 세션의 도구 권한 정책은 그 wrapper·임의 `docker exec`/`mysql` 실행을
  승인 없이는 수행하지 못하게 막는다 — 확인차 `docker ps`로 로컬에 `jokertest-db-1`(공유 개발
  DB) 컨테이너가 떠 있는 것은 확인했지만, `isolatedTestDb.js`의 `ALLOWED_DATABASE_NAMES`
  가드가 명시적으로 승인하지 않은 대상이라 그 컨테이너로 destructive reset을 시도하지 않았다.

## 제약 / 미검증

- **`voteParticipation.persistence.test.js`의 12개 시험은 이 세션에서 실제 통과로 실행되지
  못했다 — 코드는 존재하고 스킵 게이트가 정상 동작함을 확인했을 뿐이다.** 실제 DB 검증(AC-01의
  유일 제약·AC-02의 실제 경합·A-03의 저장 실패 재시도·AC-03의 실제 재투표/TRIBUNAL 전이·AC-04/
  AC-05의 실제 JOIN 집계)은 `F01_TEST_DATABASE_URL`을 주입할 수 있는 운영자 wrapper 실행
  권한에서만 얻을 수 있다. 이 문서는 이 사실을 완료로 위장하지 않는다.
- 프런트엔드 production build는 이번 변경으로 프런트 파일을 전혀 건드리지 않았으므로(F-11은
  순수 백엔드 슬라이스) 별도로 재실행하지 않았다 — 기존 F-10 evidence 문서의 마지막 빌드
  결과가 이 저장소의 최신 통과 기록이다. AC-06이 요구하는 "프런트엔드 production build 통과"는
  이번 변경이 프런트를 건드리지 않았다는 사실 자체로 회귀 위험이 없다고 판단했으나, 실제
  `npm run build --prefix frontend` 재실행 증거는 이 문서에 없다.
- 백엔드 전체 회귀(`npm test --prefix backend`)는 이 호출에서 실행하지 않았다 — 지시서가 "구현
  중 시험은 고친 패키지만" 돌리라고 명시했고, 고친 두 파일의 전체 회귀(game-core dayVote,
  socket gameSession)는 위 실행 결과로 확인했다. 검사(VERIFY) 단계에서 백엔드 전체 스위트를
  돌려야 한다.
- Pluto L(DB3)·U(QA5)의 수동 대기 상태는 그대로 보존했다 — 이 구현 호출에서 해소를 시도하지
  않았다.
