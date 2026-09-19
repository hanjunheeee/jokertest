# Pluto 파이프라인 2차 — 2026-09-18

같은 날 오후 검토 합의(회차·모니터 규칙 → 공식 영수증 → 세션 재개 → delta 중심 심사)를 `C:/dev/pluto/packages/daemon`에 구현했다. **구현 완료 기록**이며 배포(데몬 재빌드·재시작)와 실측은 별도다. 오전의 심사 고리 수정은 [2026-09-18-pluto-review-loop-fix.md](2026-09-18-pluto-review-loop-fix.md).

## 1. 회차·모니터 규칙

- **사람 재시도 상한** (`stages/retry.ts` `humanRetryPermit`, `server.ts` `pluto/slices/retry {id, reason?}`)
  - 자동 한도 3회 전: 자유.
  - 3회 이상: `reason` 10자 이상 필수. 사유는 다음 구현 힌트 맨 위에 실린다.
  - 절대 상한 6회: 사람도 못 넘는다. 거절 메시지가 "슬라이스를 나눠 다시 걸어라"를 말한다.
  - 근거: BF 8회, BD 15회는 사람 재시도가 상한을 우회한 결과였다.
- **인프라 실패 분리** (`stages/implement.ts` `declaredOutcome`)
  - 구현 호출이 끊겨(턴 상한·MCP 정지·연결 실패) done.json이 없으면 R-INFRA. retry 카운터를 먹지 않는다.
  - 멀쩡히 끝났는데 done.json이 없으면 예전대로 R-IMPL.
  - 근거: F-21 IMPL-5 "도구 호출을 완료하지 못했다 (MCP 정지 또는 턴 상한)"이 R-IMPL로 기록돼 회차를 소모했다.
- **모니터 규칙 (운영, 코드 아님)**
  - 모니터는 상태 확인·오류 분류·공식 절차 호출만 한다. 워크트리의 코드를 직접 고치거나 커밋하지 않는다.
  - 수리가 필요하면 `pluto/slices/retry {id, reason}`로 공식 회차를 돈다. 회차 상한에 걸리면 슬라이스를 나눈다.
  - 재개 전 Codex 앱 모니터 세션은 이 규칙에 맞게 바꾸거나 끈다.

## 2. 공식 영수증

- `impl-check.ts`가 `.pluto/checks/<name>.json`에 `commit`(실행 시 HEAD), `dirty`(미커밋 변경 여부), `summary`(node --test 마지막 요약: tests/pass/fail/skipped/cancelled)를 추가로 묶는다. 구현자가 done.json에 쓰는 문장은 증거가 아니다.
- 검사 단계(`stages/verify.ts` `runPlanned`)는 같은 후보 HEAD·clean·exit 0·(테스트면 fail 0·cancelled 0·tests ≥ 1)인 영수증이 있으면 `npm test`·`npm run build`를 다시 돌리지 않고 `reusedFrom`으로 남긴다. 로그: `검증 근거 재사용 — npm test — 구현 실행기 영수증 … (후보 <sha> · tests N fail 0 skip K · 새 실행 아님)`.
- 설치 명령과 실행기가 모르는 명령(`--prefix` 지정 등 jokertest의 verifyCommands 대부분)은 언제나 실제로 돈다. jokertest에서 이 재사용이 걸리려면 verifyCommands를 실행기 명령으로 맞추거나 실행기를 확장해야 한다.

## 3. 세션 재개

- `ai.ts` `ClaudeCall.resume` → `--resume <session id>`. 인자 조립은 `cliArgs`로 분리해 테스트가 직접 잰다.
- `stages/implement.ts` `resumeSession`: R-IMPL 되감기 1·2회차는 마지막 IMPL 기록의 세션을 잇는다. 프롬프트는 지시서 전체가 아니라 "같은 세션 이어가기 + 이전 시도에서 배운 것 + 완료 규칙"만이다. 3회째는 새 세션(파일 인계 = 기존 implementationContext), 4회째는 기존 자동 한도로 사람.
- 세션을 못 찾으면(CLI가 대화를 못 찾음) 한 번만 새 세션으로 다시 부른다. 회차를 태우지 않는다.
- 로그: `구현 세션 이어가기 — 되감기 N회차 · 세션 xxxxxxxx… (코드 다시 읽지 않음)`.

## 4. delta 중심 심사 보완

- `config.reviewReadSources`(기본 켬): Claude 결과 심사가 작업본에서 `Read·Grep·Glob`만 열고 12턴 안에서 patch 밖 호출부·소비처·계약 원문을 확인할 수 있다. 안전 모드로 사용자 훅·MCP·메모리는 끈다. 프롬프트 첫 줄이 "파일을 읽을 수 없다"에서 "읽기 전용으로 확인하라, 부재를 단정하지 마라"로 바뀐다. Codex는 이미 작업본 읽기가 가능했다.
- delta 블록에 슬라이스 전체 변경 파일 목록을 싣는다. delta에 없는 파일이 무엇인지 알고 필요하면 연다.
- 최초 심사는 전체 patch 그대로다. 생략하지 않는다.

## 검증

- 단위 테스트 `test/pipeline-v2.test.ts` 22개 + `test/review-loop.test.ts` 12개 통과. 통합 테스트: 영수증 재사용 1개(verify.test), 세션 재개 단언 2개(retry.test).
- 동작 변경으로 기대값을 바꾼 기존 테스트 2개: `retry.test` "자동 재시도를 3회 소진하면…"(4회째 사람 재시도에 사유 필수, 사유가 힌트에 실림), `pack.test` "impl/start는 곧바로 구현을 건다"(끊긴 호출은 R-IMPL 3회 소진이 아니라 R-INFRA로 error 자리에서 멈추고 retry 0).
- 전체 `npm test`(9차 후): 203개 중 201개 통과, 실패 1(기준선 WIP), skip 1(기존 win32 플랫폼 조건 테스트).

## 2차 검토 반영 — 영수증 (2026-09-18)

검토자가 재현한 세 문제를 확인했고 모두 실제였다.

1. **전부 SKIP이어도 재사용됨.** `fail 0 · tests > 0`만 봤다. 이제 `fail 0 · cancelled 0 · skipped 0 · pass > 0 · pass === tests`일 때만 "성공"이다. SKIP이 하나라도 있으면 실제로 돌린다.
2. **산출물이 사라져도 재사용됨.** 영수증에 `artifacts`(dist·frontend/dist·backend/dist 전체 파일과 `node_modules/.package-lock.json` 지문)와 `runtime`(node 버전·플랫폼·아키텍처)을 기록하고, 재사용 시 현재 지문과 같아야 한다. 지문이 없는 영수증은 재사용하지 않는다. 원본 로그가 없거나 로그의 마지막 요약이 영수증 요약과 다르면 재사용하지 않는다(`receiptLogValid`).
3. **정상 흐름에서 재사용이 안 됨.** 구현자는 시험 → done.json → pluto 커밋 순서라 영수증이 이전 커밋·미커밋으로 남았다. 실행기가 시험 시점의 작업 트리 id(`workingTreeId`: 임시 인덱스로 `add -A` 뒤 `.pluto` 제외, 커밋과 같은 규칙)를 기록하고, 커밋 직후 `sealReceipts`가 `HEAD^{tree}`와 같은 영수증을 그 커밋으로 봉인한다(`sealed: {from, at}` 기록). 로그: `실행기 영수증 N건을 후보 <sha>에 봉인`.

단위 테스트: 전부/일부 SKIP·환경 불일치·환경 기록 없음 거부, 산출물 지문 변화, 실제 git 저장소에서 시험 → 커밋 → 봉인 → 재수정 시 불일치.

## 3차 검토 반영 — 영수증 입력·지문 (2026-09-18)

검토자가 재현한 세 문제를 확인했고 모두 실제였다.

1. **시험 도중 코드 변경.** posttest·codegen이 소스를 바꾸면 종료 시점 트리로 봉인돼 시험하지 않은 코드에 성공이 붙었다. 실행기가 실행 **전** 트리(`treeBefore`)와 **후** 트리(`tree`)를 둘 다 기록하고, 둘이 같을 때만(`inputStable`) 재사용·봉인한다. 다르면 실행기가 경고를 찍는다.
2. **명령 사이 산출물 변경.** 검사 시작 때 한 번 계산한 지문을 계속 썼다. 이제 재사용 판단 **직전**에 명령마다 산출물·설정 지문을 다시 계산한다.
3. **설정 변경.** 지문에 `.env`·환경변수가 없었다. `configDigest`가 루트·frontend·backend의 `.env*`·`.npmrc` 내용 해시와 휘발성 아닌 환경변수(이름과 값 해시)를 묶는다. 도구가 붙이는 변수(`CLAUDE*`·`npm_*`·`PATH`·`PWD`·`TMP` 등, `VOLATILE_ENV`)는 뺀다 — 넣으면 구현 실행기(Claude 자식)와 검사 데몬의 지문이 절대 같아질 수 없다. PATH는 런타임 지문(node 버전)으로 대신 본다.

단위 테스트: 실행 전후 트리 불일치·설정 불일치·기록 없음 거부, `.env` 생성·변경과 앱 환경변수 변경 시 지문 변화, 휘발성 변수 무시, 트리가 바뀐 영수증 봉인 거부.

알려진 한계: `VOLATILE_ENV` 목록에 없는 도구 변수가 실행기와 데몬 사이에 다르면 재사용이 안 된다(안전한 쪽 실패). 첫 실측에서 `검증 근거 재사용` 로그가 안 찍히면 두 프로세스의 환경변수 차이를 비교해 목록을 조정한다.

## 4차 검토 반영 — npm 설정 · 시험 입력 산출물 (2026-09-18)

1. **`npm_*` 전체 제외가 실행 설정까지 지움.** `npm_config_ignore_scripts` 같은 실행 설정이 무시돼 환경이 바뀌어도 영수증이 허용됐다. 이제 `npm_config_*`는 비교한다. 빼는 npm 변수는 npm이 스크립트를 돌릴 때만 붙이는 `npm_package_*`·`npm_lifecycle_*`·`npm_execpath`·`npm_node_execpath`·`npm_command`와 기계 경로(`npm_config_user_agent`·`local_prefix`·`global_prefix`·`globalconfig`·`userconfig`·`cache`·`prefix`·`npm_version`·`node_gyp`·`init_module`)뿐이다.
2. **시험 도중 dist 변경 허용.** `artifactsBefore`를 기록만 하고 판단에 안 썼다. 시험 영수증은 `artifactsBefore === artifacts`(실행 중 산출물 불변)이어야 재사용한다. 빌드 영수증은 산출물을 만드는 명령이라 실행 후 산출물이 지금과 같으면 된다.

단위 테스트: `npm_config_ignore_scripts`·`npm_config_production` 변경 시 지문 변화, `npm_package_*` 등 무시, 시험 중 산출물 변경 거부, 빌드 전후 차이 허용과 현재 산출물 불일치 거부.

## 5차 검토 반영 — 사용자·전역 npm 설정 파일 (2026-09-18)

`npm_config_userconfig`가 가리키는 파일 내용을 비교하지 않아, 그 파일의 `ignore-scripts`를 바꿔도 이전 영수증이 허용됐다. `configDigest`가 사용자 설정 파일(`npm_config_userconfig`, 없으면 홈의 `.npmrc`)과 전역 설정 파일(`npm_config_globalconfig`, 없으면 `npm_config_prefix/etc/npmrc`)의 내용 해시를 지문에 넣는다. 파일이 없으면 "absent", 경로를 알 수 없으면 "unset"으로 남긴다.

단위 테스트: 사용자 npmrc의 ignore-scripts 변경, 전역 npmrc 생성, 홈 `.npmrc` 생성 시 지문 변화.

(아래 6차에서 정정) "unset"을 같게 취급한 것은 잘못이었다.

## 6차 검토 반영 — 설정 파일 위치를 모르면 재사용하지 않는다 (2026-09-18)

5차의 "위치를 모르면 unset으로 같게 취급"은 검증을 잘못 생략하는 구멍이었다. 전역 npm 설정에서 추가 검사를 꺼 둔 채 통과한 영수증이, 그 검사를 켠 뒤에도 재사용되는 사례가 재현됐다.

- `configDigest`: 사용자·전역 설정 파일 위치를 환경변수(`npm_config_userconfig`·`npm_config_globalconfig`)에서 찾고, 없으면 `npm config get userconfig|globalconfig`로 npm에 묻는다(워크스페이스 안에서는 ENOWORKSPACES라 임시 디렉터리에서 `--workspaces=false`, Windows는 cmd.exe 경유). 둘 중 하나라도 못 찾으면 지문은 **빈 문자열**이다.
- `matchImplementationReceipt`: 지문이 빈 문자열이면(지금이든 영수증이든) 어떤 영수증도 재사용하지 않는다. 모르면 실제로 돌린다.
- 이 기계에서 실제 조회 확인: 지문 생성 약 0.7초.

단위 테스트: npm이 위치를 못 주거나 실패하면 지문 없음, 지문 없음이면 재사용 없음, npm이 알려 준 파일 내용 변경 시 지문 변화. 기존 지문 테스트는 조회를 고정값으로 주입해 npm에 의존하지 않는다.

## 7차 검토 반영 — 프로젝트 .npmrc의 설정 파일 지정 (2026-09-18)

6차의 "임시 디렉터리에서 npm에 묻기"는 프로젝트 `.npmrc`가 `globalconfig=`·`userconfig=`로 다른 파일을 지정한 경우를 놓쳤다. 그 파일을 바꿔도 영수증이 허용되는 사례가 재현됐다.

- `npmConfigGet(key, env, cwd)`: 반드시 **프로젝트 디렉터리**에서 `npm config get <key> --workspaces=false`를 묻는다. 이 기계에서 확인: 워크스페이스 패키지 안에서도 동작하고, `.npmrc`의 `globalconfig=` 지정을 그대로 돌려준다.
- 못 찾으면 지문이 빈 문자열이고 재사용은 없다(6차 규칙 유지).

단위 테스트(실제 npm 사용, 없으면 건너뜀): 임시 프로젝트의 `.npmrc`가 지정한 전역 파일 경로를 npm이 돌려주고, 그 파일 내용이 바뀌면 지문이 바뀐다.

## 8차 — 조커의 `--prefix` 명령 연결 · t.skip (2026-09-18)

- 실행기(`impl-check.ts`)가 `test --prefix <dir>`·`build --prefix <dir>`를 받는다. `<dir>`은 상대 경로만(`..`·절대 경로·임의 인자 거부). 영수증 `args`는 `["test","--prefix","frontend"]` 꼴.
- 검사 명령 ↔ 영수증 짝(`receiptArgs`): `npm test [--prefix X]`·`npm run build [--prefix X]`만. 조커의 backend 전용 스크립트(`run-backend-tests.cjs`)와 `npm ci`는 실행기가 모르므로 언제나 실제로 돈다.
- 구현 지시 문구(DONE_LINE)에 `--prefix` 사용법 추가.
- npm 없는 환경의 설정 조회 테스트는 `return`이 아니라 `t.skip()`으로 집계된다.

**조커 실측(실행기만, 데몬 없이):** `node …/impl-check.js test --prefix frontend`가 jokertest 루트에서 frontend 1941/1941 통과(37초), 영수증에 `args`, 요약, 실행 전후 트리 동일, 산출물 동일, 설정 지문 있음, 런타임 `v24.20.0/win32/x64`가 기록됐다. 루트 저장소라 `dirty: true`(미커밋 문서)인데, 워크트리에서는 구현 커밋 직후 봉인된다.

이제 조커 verifyCommands 중 `npm test --prefix frontend`·`npm run build --prefix frontend` 두 개가 영수증 재사용 대상이다. 구현자가 실행기로 같은 명령을 돌리고 그 트리가 그대로 커밋되면 검사 단계는 frontend 테스트(약 30초)와 빌드를 다시 돌리지 않는다. backend 검사는 그대로 돈다.

## 9차 — --prefix 설정 범위 · 데몬 재사용 실증 · 세션 재개 실증 (2026-09-18)

1. **`--prefix` 설정 비교 결함(맞음).** frontend 시험인데 npm 설정을 루트에서 조회했다. `configDigest(wt, env, lookup, prefix)`가 `--prefix` 디렉터리에서 `npm config get`을 묻고 그 디렉터리의 `.env*`·`.npmrc`도 지문에 넣는다. 실행기는 영수증의 prefix로, 검사는 검사 명령의 prefix로 같은 규칙을 쓴다. 실제 npm 테스트: `frontend/.npmrc`의 `globalconfig=` 지정을 따르고 루트 지문과 다르며, 그 파일이 바뀌면 지문이 바뀐다.
2. **데몬의 실제 재사용(실증).** `verify.test` 신규 통합 테스트(실제 데몬·git·npm): 가짜 구현자가 `npm ci` → 실행기 `build` → 실행기 `test` → done.json. 로그에 `실행기 영수증 2건을 후보 <sha>에 봉인`, `검증 근거 재사용 — npm run build — 구현 실행기 영수증 …`, `검증 근거 재사용 — npm test — …`가 찍히고, 테스트 스크립트는 전체 흐름에서 정확히 한 번만 실행됐다(이벤트 기록 `test, claude, codex`). 설치는 실제로 돌았다. 결과 `commands[]`의 test·build 항목에 `reusedFrom`이 남는다.
   - 이 과정에서 기존 구멍 하나를 더 고쳤다: `normalizeCommands`가 상태 파일을 읽을 때 `reusedFrom`을 떨어뜨려 "새 실행이 아님"이 사라졌다. 이제 보존한다.
   - 확인된 한계: 영수증 재사용은 `node --test` 요약(`ℹ tests/pass/fail…`)이 로그에 있어야 한다. 요약을 내지 않는 러너(vitest·jest 등)의 시험 영수증은 재사용되지 않고 실제로 돈다(안전한 쪽). 조커 frontend·backend는 `node --test`라 해당 없음.
3. **세션 재개(실증).** `retry.test` 두 통합 테스트에 단언 추가: R-IMPL 되감기 1회차의 IMPL-2 프롬프트는 "같은 구현 세션을 이어 간다"와 "이전 시도에서 배운 것"만 담고 지시서 전문(`## 수정 범위`)은 없다. 가짜 CLI가 받은 argv에 `--resume fake-session`(직전 IMPL의 session_id)이 있고, 첫 구현에는 없다. 3회 소진 시나리오에서 IMPL-2·IMPL-3은 `--resume`, IMPL-4(3회째)는 새 세션이다. BF(retry 8)는 이 규칙의 대상이 아니므로 BF로 실측하지 않는다.

## 10차 — 규칙 이전에 상한을 넘긴 작업의 재개 (2026-09-18)

BF는 retry 8인데 새 절대 상한 6이 사람 재시도까지 막았다. 새 규칙 아래서는 회차가 정확히 6에서 서므로 `retry > 6`은 규칙 이전의 옛 회차뿐이다. `humanRetryPermit`: 옛 회차는 사유(10자 이상)가 있으면 재개(`legacy: true`), 힌트 맨 위에 `[절대 상한 6 이전의 옛 회차 N — 사람 사유로 재개]`를 남긴다. 사유 없으면 거절. `retry === 6`은 여전히 분할만이 답이다.

F-21 시험 실패 3건(DB 저장 대기가 setImmediate 200회)의 판단과 재개 명령은 [2026-09-18-f21-persist-wait-finding.md](2026-09-18-f21-persist-wait-finding.md).

## 남은 것

- (8차에서 해결) verifyCommands의 `--prefix` 명령은 이제 실행기·영수증과 짝이 된다. backend 전용 스크립트는 여전히 실제 실행.
- 세션 재개는 가짜 CLI로 `--resume <직전 session_id>` 전달까지 확인했다(9차). 실제 Claude CLI가 그 세션을 실제로 이어 붙이는지는 새 슬라이스의 첫 R-IMPL 되감기에서 IMPL-n.json의 sessionId 동일 여부로 본다.
- 모니터 규칙은 코드로 강제하지 않았다.
