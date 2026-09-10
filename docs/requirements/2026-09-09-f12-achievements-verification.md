# F-12 22개 업적·자동 보상·서고 해금 — 구현 및 검증 증거 (2026-09-11)

프론트가 이미 그리고 있는 "금지된 기록" 7개(서고)와 5직업 도전과제 15개(초대받은 자들)의
기존 id·원문·순서를 유지한 채, 서버가 실제 경기 결과·투표 참여에서 진행률·달성을 판정하고
F-08(경제) 계약을 통해 재화·테두리를 자동·1회 지급하도록 연결한다. 프론트 두 정의 파일
(`spreadMeta.js`, `jobChallenges.js`)은 이번 슬라이스에서 고치지 않았다 — 서버 쪽에 같은
id로 매핑되는 새 정의 소스(`achievementDefinitions.js`)를 만들어 값을 대조했을 뿐이다.

## AC별 변경

### AC-01 — 기존 22개 id·원문·순서 보존, 서버 진행률·달성 연결
- `backend/services/achievementDefinitions.js`(신규): `ACHIEVEMENT_DEFINITIONS` 22개
  (`FORBIDDEN_RECORD_ACHIEVEMENTS` 7 + `JOB_ACHIEVEMENTS` 15)가 프론트 두 파일의 id를
  그대로 옮겨 적는다. 직업 접두사는 프론트 id 문자열(`witchHunter` 키인데 id는
  `witch-hunter-win-*`인 케밥케이스 불일치 포함)을 그대로 따랐다 — `idPrefix` 필드로 이
  불일치를 명시적으로 드러낸다(`achievementDefinitions.test.js`가 이 정확한 22개 id
  목록·순서를 프론트 발췌와 1:1로 대조한다).
- `backend/repositories/gameResult.repositories.js#getAchievementProgressStats`(신규):
  `game_result_players`를 `game_results`와 JOIN해 정상 확정(비개발) 경기만 남긴 뒤
  `completedGames`·`survivals`·`wins`·`roleWinsByRole`를 계산한다.
  `backend/repositories/voteParticipation.repositories.js#countEligibleDayVoteParticipations`
  (F-11, 기존)를 함께 써서 `voteParticipations`까지 합치면 22개 전부의 판정 원천이 갖춰진다.
- `backend/services/achievementService.js#evaluateAndGrantForUser`(신규): 위 두 저장소 값을
  모아 22개 정의를 전부 순회하며 임계값을 판정하고, 달성한 것만 `grantAchievement`로
  지급한다.

### AC-02 — 서버 임계값 판정
- 기록 7개: 게임 완료 3/15회(`COMPLETED_GAMES`), 투표 참여 10회(`VOTE_PARTICIPATIONS`), 종료
  시 생존 5/20회(`SURVIVALS`), 승리 10/30회(`WINS`) — `achievementDefinitions.js`의 threshold
  그대로.
- 직업 15개: 각 직업(귀족=CITIZEN/광대=JOKER/주치의=DOCTOR/경비원=GUARD/
  마녀사냥꾼=WITCH_HUNTER)별 10·20·30승(`ROLE_WINS` + `role`).
- `achievementService.js#currentValueOf`/`meetsThreshold`는 metric별로 값을 골라 임계값과
  비교하는 순수 함수다 — `achievementService.test.js`가 각 metric의 임계값 직전/도달 경계를
  모두 검증했다(fake db 불필요, DB 없이 실제로 통과).

### AC-03 — F-08 계약을 통한 자동 보상(원자적)
- `backend/service/economy.service.js`: `grantAchievementCurrency`/`grantAchievementItem`
  (신규, 둘 다 export) — 기존 `applyLedgerTransaction`을 그대로 재사용하는 얇은 래퍼다.
  `grantAchievementItem`은 `ensureDefaultEntitlements`와 같은 트릭(재화 GOLD 0원 원장에
  아이템 소유권을 얹는다)을 쓰고, `ITEM_ALREADY_OWNED`를 삼켜(A-03: 기존 테두리 보유가
  거래 전체 실패를 일으키면 안 된다) 멱등하게 만든다.
- `backend/economy/catalog.js`: 직업별 30승 보상 테두리 5종(`profile-border-귀족` 등,
  `JOB_PROFILE_BORDER_NAMES`)을 카탈로그에 추가했다 — 구매 상점의 등급별 테두리(남작~황제)와
  완전히 분리된 별도 품목이고(`purchasable:false`), 이 항목이 있어야 `equipItem`이 지급된
  테두리의 종류(`ITEM_TYPES.PROFILE_BORDER`)를 검증할 수 있다.
- `backend/services/achievementService.js#grantAchievement`: `db.sequelize.transaction`
  하나로 (1) `achievement_grants` 행 삽입 (2) 재화 보상들 (3) 아이템 보상을 순서대로 실행한다
  — 하나라도 던지면 전체가 롤백된다(1번도 포함, 재시도 시 처음부터 다시 시도 가능).
  기록 7개는 골드50+다이아50, 직업 10승은 골드10+다이아10, 20승은 골드20+다이아30, 30승은
  테두리 — 아이콘 파일명의 숫자는 값 계산에 전혀 쓰지 않았다(`achievementDefinitions.test.js`가
  아이콘 대신 리터럴 count로만 검증).

### AC-04 — 동시 달성·중복 요청·재시도·재진입에도 1회 지급
- `backend/db/migrations/0009-add-achievement-grants.js`(신규) + `achievementGrant.model.js`
  (신규): `(user_id, achievement_id)` 복합 유일 인덱스. `gameResult.repositories.js`가 이미
  쓰는 원칙("멱등성의 근거를 프로세스 안의 플래그가 아니라 DB 제약에 둔다")을 그대로
  따른다 — 앱 레벨 락·큐를 별도로 두지 않았다.
  `grantAchievement`의 `findOrCreate`가 `created:false`면 재화·아이템을 다시 지급하지 않고
  즉시 반환한다.
  각 재화 보상도 `achievement:{id}:{currency}`라는 결정적 `referenceEventId`로
  `applyLedgerTransaction`의 기존 (user_id, reference_event_id) 유일 제약을 한 번 더 통과한다
  — 두 레이어(업적 지급 게이트 + 원장 재처리 방지)가 겹으로 중복 지급을 막는다.
- `achievementService.test.js`가 fake db(같은 키를 쥔 트랜잭션이 끝날 때까지 다음 요청이
  기다리는, InnoDB 유일 인덱스 잠금을 흉내 낸 인메모리 구현)로 진짜 동시 `Promise.all` 호출·
  순차 재시도 양쪽 모두 재화가 한 번만 지급됨을 실제로 통과시켜 검증했다.
  `backend/tests/db/f12-achievements.integration.test.js`(신규, DB 게이트)가 같은 시나리오를
  실제 MySQL 유일 제약 위에서 검증하도록 작성했다(이 세션 실행 결과는 "실행 결과" 참고).

### AC-05 — 중단 경기 제외, 정상 과거 경기 소급 1회 지급
- `getAchievementProgressStats`/`countEligibleDayVoteParticipations` 둘 다
  `roleStatisticsPolicy.isAchievementRewardEligibleGame({completed, gameSourceValue})`(F-10이
  이미 F-12를 위해 노출해 둔 게이트, 기존)로 `completed===true && gameSource!=='development'`
  인 경기만 남긴다 — 중단 경기(`completed:false`)와 개발 경기는 진행률에 아예 나타나지
  않는다.
- 소급(계획 메모: "페이지 방문 여부에 의존하지 않는 재실행 가능한 처리 경로")은
  `evaluateAndGrantForUser`가 **델타가 아니라 매번 계정의 전체 이력을 다시 계산**하는
  것으로 만든다 — 이 기능이 배포되기 전에 이미 쌓여 있던 과거 확정 경기·투표도, 그 계정이
  다음 게임 완료(`persistTerminalSession`) 또는 다음 낮 투표(`handleSubmitDayVote`)를
  처음 트리거하는 순간 한 번에 잡힌다. 별도의 배치/백필 스크립트를 두지 않았다 — 이미 있는
  두 이벤트 트리거가 곧 재실행 경로다.
- `backend/socket/gameSession.js`: `persistTerminalSession`은 `gameResultRepository
  .persistGameResult`가 성공/실패(이미 저장됨 포함)와 무관하게 세션 참가자 전원에 대해
  fire-and-forget으로 `evaluateAchievementsForUsers`를 부른다(게임 진행·방송을 막지 않는다는
  기존 규칙 유지). `handleSubmitDayVote`는 ack를 먼저 보낸 뒤 같은 방식으로 투표자 한 명만
  재평가한다(ack 지연 없음). 둘 다 `evaluateAchievementsImpl`이라는 교체 가능한 참조를 통해서만
  호출해(`recordVoteParticipationImpl`과 동일한 기존 관례), 순수 단위 시험이 실제 DB 없이
  ack/방송 타이밍만 검증할 수 있게 했다(`__setEvaluateAchievementsForTests`, 신규 testable).

### AC-06 — 재로그인·새로고침 후 서버 값대로 복원(manual)
- 서버 상태(달성 여부·진행률·지급된 재화·테두리 소유권)는 전부 DB에 영속돼 있어(위 AC-01~05)
  재로그인·새로고침 자체로는 사라지지 않는다. **다만 이 슬라이스는 그 상태를 프런트에
  내려주는 읽기 API·프런트 연동을 만들지 않았다** — 수정 범위가 서버 판정·지급 경로
  (`gameResult.repositories.js`/`gameSession.js`/`economy.service.js`와 신설 4개 파일)로
  한정돼 있고, 새 라우트/컨트롤러/프런트 훅은 승인된 범위·신설 목록 어디에도 없다. 실제
  브라우저로 재로그인·새로고침·다른 브라우저·계정 전환을 확인하는 절차는 이 세션 도구로
  수행할 수 없었고, 읽기 API가 없어 구조적으로도 아직 대상이 없다 — **미검증으로 남긴다**
  (아래 "제약/미검증" 참고). `EconomyLoadout`/`EconomyEntitlement`(F-08, 기존)가 소유·장착을
  이미 영속화하므로, 다음 슬라이스가 읽기 API 하나만 추가하면 이 AC를 완성할 수 있는 상태다.

## 새 스키마

`achievement_grants`(`0009-add-achievement-grants.js`) 하나만 추가한다. `(user_id,
achievement_id)` 복합 유일 인덱스, `user_id`는 `users.uuid` FK. `0008-add-vote-
participations.js`와 같은 패턴(멱등한 `up`, 존재 확인 후 생성, `verify`, `down`)이다.
`backend/scripts/migrate-db.js`의 `MIGRATIONS`에 등록해 실제 배포 명령에서도 순서대로
적용되고, `backend/tests/helpers/isolatedTestDb.js`의 관리 테이블 목록·드롭 순서에도
등록해 다른 격리 DB 통합 스위트가 이 테이블을 "모르는 테이블"로 오판해 거부하지 않게 했다.
`backend/__tests__/schema.existingTables.test.js`의 `NEW_MODELS` 목록도 `AchievementGrant`를
포함하도록 갱신했다(모델 목록 회귀 시험이 새 모델을 모르면 실패한다).

## 복구 절차

기존 테이블 컬럼을 바꾸거나 데이터를 변형하지 않는다(신규 테이블 1개만 추가). 실패 시 복구는
`docs/requirements/2026-09-09-f01-migration-runbook.md`의 기존 절차(`migrate-db.js status` →
실패 이력 확인 → 필요 시 백업 복원 → `resolve-failure --confirm`)를 그대로 따른다. `down`은
`achievement_grants`를 드롭하므로, 이미 지급된 업적 이력을 보존해야 한다면 드롭 전 별도
백업이 필요하다(0001~0008과 동일한 수준 — 자동 백업 없음). 지급된 재화·소유권 자체
(`economy_ledger_entries`/`economy_entitlements`)는 F-08 스키마가 소유하므로 이 마이그레이션의
`down`과 무관하게 보존된다 — `achievement_grants`만 되돌리면 같은 업적이 다음 평가 호출에서
다시 "새로 지급 가능"한 상태로 보이니, 실제 운영 롤백 시에는 재화 이중 지급 위험을 고려해야
한다(이 문서가 자동으로 막아주지 않는다).

## 과거(개발) 경기 식별 가능성

`isAchievementRewardEligibleGame`이 신뢰하는 `settings.gameSource.value`가 아예 없는 과거
행(F-12 이전, `gameSource` 필드가 생기기 전에 저장된 경기)은 F-10/F-11과 동일한 근거로
"development"로 재분류하지 않고 운영 기록으로 보아 소급 집계 대상에 포함한다(A-06의 전제와
동일). 새로 저장되는 경기는 전부 `gameSource` 값을 갖는다.

## 실행 결과

- `node impl-check.js node-test backend/services/achievementDefinitions.test.js`: **9/9
  통과** — 22개 id·순서·보상(기록 7개 골드50·다이아50, 직업 10/20/30승 골드·다이아·테두리)이
  프론트 발췌와 정확히 일치함을 DB 없이 확인했다.
- `node impl-check.js node-test backend/services/achievementService.test.js`: **11/11 통과**
  — metric별 임계값 판정, 업적 하나의 다중 보상 지급, 재평가/동시 요청 중복 지급 없음(fake
  db가 실제 InnoDB 유일 인덱스 잠금과 같은 성질을 흉내 낸다), 부분 실패 롤백(재화 하나
  실패 시 `achievement_grants` 행도 롤백되고 재시도로 정상 지급됨), 22개 전체 평가, 소급
  1회 지급, 중단/개발 경기 배제(진행률이 0으로 이미 걸러진 입력을 신뢰)까지 전부 DB 없이
  실제로 통과시켰다.
- `node impl-check.js node-test backend/service/economy.service.test.js`: **24/24 통과**
  (기존 — `grantAchievementCurrency`/`grantAchievementItem` 추가가 F-08 기존 계약을
  깨지 않음을 회귀로 확인).
- `node impl-check.js node-test backend/__tests__/schema.existingTables.test.js`: **25/25
  통과**(`AchievementGrant` 모델 등록 반영).
- `node impl-check.js node-test backend/__tests__/isolatedTestDb.guard.test.js` /
  `migrationRunner.test.js`: 각 **10/10**, **14/14 통과**(격리 DB 관리 목록 확장·마이그레이션
  실행기 자체는 회귀 없음).
- `npm test --prefix backend`(전체 백엔드 회귀, `--env-file=.env.test`로 `DATABASE_URL`이
  주입된 상태): **1376개 중 1274 통과, 0 실패, 102 skip**. skip은 전부 기존
  `F01_TEST_DATABASE_URL` 게이트(이 세션에 주입되지 않음)에 의한 것이고 F-12 신규 skip 7개
  (`backend/tests/db/f12-achievements.integration.test.js`)도 같은 이유로 동일하게 skip
  됐다 — 실패가 아니다. **새로 실패한 시험은 없다.**
- `backend/tests/db/f12-achievements.integration.test.js`(신규, 7개 시험: 직업 10승 지급,
  30승 테두리 지급, 동시 요청 1회 지급, 재진입 재시도 무지급, 중단 경기 제외, 개발 경기
  제외, 소급 1회 지급)는 **이 세션에서 실제 통과로 실행되지 못했다** — 코드는 존재하고
  skip 게이트가 정상 동작함을 확인했을 뿐이다. F-11 구현 세션과 같은 이유(운영자 wrapper의
  `F01_TEST_DATABASE_URL` 격리 MySQL 자격 증명이 이 세션에 주입되지 않음, `docker exec`/
  `mysql` 직접 실행은 `isolatedTestDb.js`의 `ALLOWED_DATABASE_NAMES` 가드 밖이라 시도하지
  않음)로 미검증이다.
- 프런트엔드: 이번 변경은 프런트 파일을 전혀 건드리지 않았다(`spreadMeta.js`/
  `jobChallenges.js`는 읽기만 했다) — production build를 다시 돌리지 않았다.

## 제약 / 미검증

- **`f12-achievements.integration.test.js`의 7개 시험은 실제 통과로 실행되지 못했다.**
  AC-03(테두리 소유권의 실제 `economy_entitlements` 반영)·AC-04(실제 MySQL 유일 인덱스
  경합)·AC-05(실제 JOIN 기반 소급 지급)의 최종 근거는 `F01_TEST_DATABASE_URL`을 주입할 수
  있는 운영자 wrapper 실행 권한에서만 얻을 수 있다. fake db 기반 `achievementService.test.js`
  가 같은 시나리오의 로직·원자성을 대체 검증했지만, 실제 MySQL 트랜잭션 격리·잠금 자체를
  증명하지는 못한다.
- **AC-06(재로그인·새로고침 후 프런트 복원)은 구조적으로 아직 검증할 대상이 없다** — 읽기
  API·프런트 연동이 이번 슬라이스 범위 밖이다(위 "AC-06" 절 참고). 실제 브라우저 검증
  (재로그인/새로고침/다른 브라우저/계정 전환/로딩/실패/재시도, 소유·장착 복원)은 이 세션에서
  전혀 시도하지 않았다.
- 백엔드 전체 회귀(`npm test --prefix backend`)는 이 구현 호출에서 직접 실행해 1274/1274
  (skip 제외) 통과를 확인했다 — 검사(VERIFY) 단계가 같은 명령을 다시 돌리더라도 결과가
  달라질 이유는 없다(격리 DB 접근 권한을 얻지 못하는 한 동일하게 skip될 것이다).
- Pluto L(DB3)·U(QA5)의 수동 대기 상태는 그대로 보존했다 — 이 구현 호출에서 해소를 시도하지
  않았다.

## 수정 범위 대비 실제 변경

승인된 6개 대상 중 `spreadMeta.js`/`jobChallenges.js`는 대조(읽기)만 했고 수정하지 않았다
(AC-01이 "기존 프론트 id·원문·순서가 유지된 채"를 요구하므로 프론트 파일을 그대로 둔 것이
의도다). 나머지 4개(`gameResult.repositories.js`/`gameSession.js`의 두 함수/
`economy.service.js`)에는 새 함수·호출부만 추가했다(계획대로).

승인된 신설 4개(`achievementDefinitions.js`/`achievementService.js`/
`achievementGrant.model.js`/이 문서)에 더해, 그 신설 파일들이 실제로 동작하려면 구조적으로
필요했던 인프라 4개를 추가로 건드렸다(계획 메모의 "따라오는 수정" 한도 파일4·부품8 이내):
`backend/db/migrations/0009-add-achievement-grants.js`(신규 모델의 테이블 정의),
`backend/scripts/migrate-db.js`(배포 마이그레이션 목록 등록),
`backend/tests/helpers/isolatedTestDb.js`(격리 DB 관리 목록 등록),
`backend/economy/catalog.js`(직업 테두리 보상의 itemId가 카탈로그에 없으면 `equipItem`이
검증할 수 없다). 여기에 관련 시험 파일 3개(`achievementDefinitions.test.js`/
`achievementService.test.js`/`f12-achievements.integration.test.js`)와 기존 모델 목록 회귀
시험 1개(`schema.existingTables.test.js`)를 더했다 — 전부 "관련 테스트 파일"로 허용된
범위다.
