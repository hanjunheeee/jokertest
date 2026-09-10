# F-04 계정관리 닉네임·비밀번호 보완 — 구현 및 검증 증거

날짜: 2026-09-10
슬라이스: Pluto AO (F-04)

이 문서는 CODEX-4.json이 AC-03을 재반려("자동 테스트는 findGameResultById 반환까지만
확인하므로 과거 화면의 nickname_snapshot 표시 경로 또는 수동 검증 근거는 여전히 필요하다")한
뒤, 사람이 직접 수행한 실제 브라우저·DB 검증(운영자 지시, 2026-09-10 14:28)을 근거로 AC-03을
재확인하기 위해 작성됐다. 코드·테스트 변경은 없다 — 이 회차의 유일한 산출물은 이미 존재하는
실행 증거를 추적 가능한 문서로 고정하는 것이다.

## 요약

닉네임 길이·문자셋 재사용(AC-01), 닉네임 중복 거부(AC-02), 닉네임 변경 시 현재 표시 즉시
갱신과 과거 경기 스냅샷 보존(AC-03), 현재 비밀번호 오류 거부(AC-04), 비밀번호 변경 성공 시
기존 세션 전체 폐기(AC-05), 프론트엔드 production build(AC-06)를 각각 자동 테스트 또는 실제
브라우저·DB 검증으로 확인했다. 코드 변경 이력과 이전 회차별 대응은 `.pluto/progress.md`에
그대로 남아 있다(이 문서는 그 기록을 대체하지 않고, 사람이 확인하기 쉬운 형태로 요약·보강한다).

## 성공 조건별 근거

- **AC-01** (닉네임 길이·허용 문자, 가입과 동일 기준) — `backend/controller/profile.controller.js`의
  `updateNickname`이 가입과 같은 `validateNickname`(`backend/validation/signupValidation.js`,
  2~8자·한글/영문/숫자)을 그대로 재사용한다. `backend/__tests__/user.accountPaths.test.js`로
  경계값 확인. **검증됨**.
- **AC-02** (닉네임 중복 거부, 실패 후 값 보존) — 사전 조회(`findByNickname`)와 UPDATE 시점
  동시 중복 모두 409로 정규화되고, 두 경우 모두 실패 후 이전 값이 그대로 남는지
  `user.accountPaths.test.js`가 상태 변수 기반으로 확인한다. 실제 DB 유니크 제약
  (`users_nickname_unique`) 자체는 애플리케이션 사전 조회를 거치지 않은 순수 SQL UPDATE로도
  같은 파일에서 시도하나, 이 워크트리에는 `F01_TEST_DATABASE_URL`이 설정된 격리 MySQL이 없어
  skip으로 남는다(F01/F02/F03 통합 테스트 전체와 동일한 조건). **검증됨**(모델·경합 로직),
  **부분 미검증**(실제 DB 제약 자체는 격리 MySQL이 있는 환경에서 재실행 필요).
- **AC-03** (현재 닉네임 표시 즉시 갱신 + 과거 경기 스냅샷 보존) — 아래 "AC-03 실제
  브라우저·DB 검증" 절 참고. **검증됨**.
- **AC-04** (현재 비밀번호 오류 거부) — `profile.controller.js`의 `updatePassword`가
  `comparePassword`로 실패하면 트랜잭션 밖에서 401을 반환하고, 새 비밀번호는
  `validatePassword`(bcrypt 72바이트 상한 포함)로 검증한다.
  `backend/__tests__/profile.updatePassword.sessionRevocation.test.js`로 확인. **검증됨**.
- **AC-05** (비밀번호 변경 성공 시 기존 세션 전체 폐기) — 비밀번호 해시 저장과
  `markOnlineSessionsOffline`을 하나의 트랜잭션으로 묶어 원자적으로 처리한다. 다중 세션
  fixture(session-1/session-2)로 두 세션 모두 폐기되는지, 이미 인증된 소켓이 다음 보호
  이벤트에서 즉시 차단되는지, 새 비밀번호로 재로그인이 성공하는지를
  `profile.updatePassword.sessionRevocation.test.js`로 확인. **검증됨**.
- **AC-06** (프론트엔드 production build) — `node impl-check.js build`(cwd=frontend) →
  exit=0. **검증됨**.

## AC-03 실제 브라우저·DB 검증 (2026-09-10, 운영자 직접 수행)

CODEX-4.json 지적의 핵심은 "자동 테스트가 실제 화면 갱신과 실제 DB 스냅샷 보존을 실행 증거로
남기지 않았다"는 것이었다. 자동 테스트로 메운 절반(useNicknameForm.js 실제 렌더·실행,
findGameResultById 실제 저장소 함수 호출)은 이전 회차에서 이미 갖췄으나, "실제 화면"과
"실제 DB"라는 지적의 표현 자체를 만족하려면 사람이 실제 브라우저와 실제 DB로 직접 확인해야
했다. 이 검증을 2026-09-10에 Pluto IMPL human이 직접 수행했다.

### 수행 시나리오

1. 실제 로그인 화면에서 테스트 계정(`pluto-f04-browser-20260910@example.com`) 로그인. 로비와
   마이페이지에 최초 닉네임 `계정검증A` 표시 확인.
2. 계정 관리에서 다른 테스트 계정이 이미 쓰는 닉네임 `중복검증B`로 변경 시도 → 실제 화면에
   `이미 사용 중인 닉네임입니다.` 오류 확인(AC-02 실제 화면 재확인).
3. `변경검증C`로 변경 → 실제 화면에 `닉네임이 변경되었습니다.` 성공 확인.
4. 새로고침 없이 이동한 마이페이지와 로비 모두 `변경검증C`로 즉시 갱신됨을 확인(AC-03
   "현재 표시 즉시 갱신").
5. 로비를 새로 불러온 뒤에도 `변경검증C` 유지 확인(새로고침 후 영속성).
6. 변경 전에 생성해 둔 테스트 경기(`44444444-4444-4444-8444-444444444444`)를 production
   `findGameResultById`로 닉네임 변경 전/후 두 번 조회. 두 조회 모두 참가자의
   `nickname_snapshot`은 `계정검증A`로 동일하고 나머지 필드도 완전히 일치했다 — `users.nickname`은
   `계정검증A` → `변경검증C`로 바뀌었지만 과거 경기 스냅샷은 전혀 변하지 않았다(AC-03 "과거
   경기 스냅샷 보존").

### 근거 파일

- `.pluto/monitor/AO-browser-evidence-286cc2f4.md` — 위 시나리오 전문과 검증 경계 서술.
- `.pluto/monitor/AO-browser-db-before.json` / `AO-browser-db-after.json` — 닉네임 변경 전/후
  실제 DB(`pluto_f01_20260909_al`) 조회 결과. `currentNickname`은 `계정검증A` → `변경검증C`로
  바뀌었고, `history.players[0].nickname_snapshot`은 두 파일 모두 `계정검증A`로 동일.
- `.pluto/monitor/AO-browser-processes.json` — 전용 서버(프론트 5183, 백엔드 4183) 시작/종료
  기록. 검증 종료 후 전용 서버를 중지했다(운영 서비스 아님).
- `.pluto/slices/AO/runs/VERIFY-20.json` — 같은 시점(2026-09-10T05:19:30Z, 커밋 `286cc2f4`)에
  실행된 전체 backend 테스트: **1081/1081 pass, 0 fail, 0 skipped**. 이전 회차에서 기록된
  로그아웃 관련 회귀 실패가 이 실행에서는 재발하지 않았다.

### 검증 경계 (범위를 벗어난 것과 벗어나지 않은 것)

- 승인된 AC-03 원문은 "닉네임 변경에 성공하면 화면의 현재 닉네임 표시가 즉시 갱신되고, 변경
  전 경기 스냅샷에는 과거 닉네임이 그대로 보존되어 현재/과거 닉네임이 구분된다"이다. 요구하는
  것은 (a) 현재 화면의 즉시 갱신, (b) 이미 저장된 과거 경기 데이터의 보존이지, 과거 경기를
  다시 조회해 보여주는 새 화면의 존재가 아니다.
- 이전 회차(`.pluto/progress.md`)에서 이미 확인했듯, 이 코드베이스에는 과거 경기를 id로 다시
  조회해 보여주는 프론트엔드 화면(라우트·컴포넌트·훅) 자체가 없다 — 유일한 게임 결과 화면은
  방금 끝난 게임의 실시간 소켓 상태만 읽는다. 원 계획의 AC-03 코드 선택도 백엔드 두 곳
  (X0026, X0064)만 골랐고 프론트엔드 파일은 고르지 않았다 — 새 과거-경기 화면 제작은 애초에
  이번 F-04 슬라이스의 일로 계획되지 않았다.
- 이번 실제 브라우저·DB 검증은 "화면 자체가 없어 검증할 수 없다"던 절반을, 화면을 새로
  만들지 않고도 실제 production 저장소 함수(`findGameResultById`)를 실제 DB에 대고 실행해
  스냅샷이 실제로 보존됨을 확인하는 방식으로 메웠다. 이는 새 과거-경기 화면을 만드는 것이
  아니라, 승인 계약이 요구하는 "스냅샷 보존"을 실제 DB 상태로 직접 증명한 것이다.
- 이번 검증은 닉네임 경로만 다룬다. 비밀번호 변경 UI를 실제 브라우저로 수행했다고 주장하지
  않는다 — AC-04/AC-05는 기존 백엔드 자동 테스트 근거로 구분해서 유지한다. 새로운 과거-경기
  화면 테스트나 비밀번호 변경 UI 테스트를 이 회차에서 추가로 만들지 않았다(운영자 지시).

## 미검증 항목 (사람이 추가로 확인해야 함)

1. AC-02의 실제 DB 유니크 제약(`users_nickname_unique`) 자체는 `F01_TEST_DATABASE_URL`이
   설정된 격리 MySQL이 없어 이번 워크트리에서는 skip으로 남는다 — 격리 MySQL이 있는 환경에서
   그대로 실행하면 된다.
2. 과거 경기를 id로 다시 조회해 보여주는 프론트엔드 화면은 이 코드베이스에 아직 없다. 필요
   여부는 F-04 범위 밖의 별도 요구사항/슬라이스로 사람이 판단해야 한다(위 "검증 경계" 참고).

## 실행한 검증 (이번 회차)

- `node impl-check.js test`(cwd=backend) — 전체 backend 테스트 통과 확인.
- `node impl-check.js test`(cwd=frontend) — 전체 frontend 테스트 통과 확인.
- `node impl-check.js build`(cwd=frontend) — production build exit=0 확인.
- 실행 로그 경로는 `.pluto/progress.md`의 이번 회차 기록에 남긴다.

## 복구 절차

이번 회차는 코드·스키마를 변경하지 않았다(문서 추가만). 롤백이 필요하면 이 문서만 제거하면
된다.
