# Pluto 심사 고리 수정 — 2026-09-18

2026-09-12 병목 보고 이후 F-19~F-21 실측으로 원인을 다시 잡고, Pluto 데몬(`C:/dev/pluto/packages/daemon`)에 세 가지를 구현했다. 이 문서는 **구현 완료** 기록이며, 배포(데몬 재빌드·재시작)와 실제 슬라이스에서의 효과 확인은 별도다.

## 실측 (batch-0ea6f89b, 원본 `.pluto/slices/<id>/runs`, `state.json` retries)

| 슬라이스 | 벽시계 | 모델 실행 합계 | IMPL 실행 | R-IMPL 반려 | 비용 |
|---|---|---|---|---|---|
| F-19 BD | 29.6h | 9.4h | 14회 | 11회 (+계획 반려 3) | $200 |
| F-20 BE | 10.2h | 4.9h | 12회 | 10회 | $201 |
| F-21 BF | 8.7h+ | 4.9h | 8회 | 7회 | $225 |

- 재검사마다 심사 입력이 슬라이스 기준점부터의 **전체 patch**였다 (`verify.ts` `reviewDiffEvidence(wt.baseCommit)`). F-21 8회차: 55파일·788,610자를 Claude 6조각 + Codex 6조각으로 읽어 심사 한 바퀴 25분.
- F-21 8회차 반려 사유는 "교차 검증 불일치 1개 — AC-04" (Codex 6개 yes, Claude AC-04 partial). 모니터 감사 결과 후보에는 AC-04 수정이 있었고 Claude 조각에서 증거가 잘린 것이었다 (`.pluto/monitor/BF-765bf674-Claude6-audit.json`). 제품 결함이 아닌 심사 인프라 결함.
- 2~7회차 반려는 "hook·핸들러는 있는데 실제 페이지·소켓 수신에 연결되지 않음" 유형 (retries hint 원문).
- 회차 사이 22~72분 공백은 대기가 아니라 Codex 앱 모니터 세션의 비공식 감사·수리 작업이다 (`.pluto/monitor/checks.jsonl` 5분 heartbeat).

## 구현한 것

1. **되감기 delta 재검사** (`state.ts` `Result.reviewedCommit`, `worktree.ts` `headCommit`/`isAncestor`, `verify.ts`, `result.ts` `JudgeAsk.delta`)
   - 심사가 읽은 후보 HEAD를 `result.reviewedCommit`에 기록한다 (반려·통과·범위 실패 회차 모두 물려줌).
   - 직전 반려 사유가 있고 `reviewedCommit`이 현재 HEAD의 조상이면 심사 patch·diffstat을 `reviewedCommit..HEAD`로 만든다. 범위 검사는 그대로 기준점부터.
   - 프롬프트에 `<되감기 delta>` 블록: 직전 조건별 판정을 싣고, 직전 `yes`이며 직전 반려에 없고 delta가 건드리지 않은 조건은 `yes`로 승계한다.
   - 로그: `결과 검토 자료 — … · 되감기 delta <sha>..HEAD`, `판정 입력 — 직전 심사 후보 이후 delta만 · 직전 yes 판정 승계`.
2. **불일치 재판정** (`result.ts` `splitVerdicts`, `JudgeAsk.tieBreak`, `verify.ts`)
   - gate 모드에서 한쪽만 `yes`인 조건은 즉시 반려하지 않는다. 반대한 엔진에 그 조건만 `<재판정>` 블록으로 다시 묻는다 (상대 판정·자기 직전 판정·파일/심볼/줄 인용 요구).
   - 재판정 뒤 합의되면 정상 진행. 그래도 갈리면 `VERIFY: human`, `returnCode: R-IMPL`, `lastAction: 교차 검증 불일치 — 사람 판단 필요`. 사람은 `pluto/slices/advance`·`retry`·`result/reject`로 푼다.
3. **소비처 연결 계약** (`state.ts` `PlanAc.wiring`, `prompts/plan-decide.md`, `stages/pack.ts`, `stages/wiring.ts`, `stages/implement.ts`, `prompts/result.md`)
   - 계획 JSON `perAc[].wiring: [{from: "path::symbol", to: "path::symbol", kind: mount|call|subscribe|emit}]`. 확인 못 한 소비처는 `unsure`/`blockers`.
   - 지시서에 "### 소비처 연결 (완료 조건)" 절과 규칙을 넣는다.
   - 구현 완료(done.json) 커밋 직후, `from` 파일이 후보에서 바뀌지 않았고 `to` 심볼도 부르지 않으면 심사 전에 R-IMPL로 돌린다. 힌트: `소비처 미연결 — AC-02: src/pages/Room.jsx::RoomPage 가 src/hooks/useKick.js::useKick 를 마운트하지 않는다`.
   - 결과 심사 프롬프트에 wiring 확인 규칙 추가.

## 검증

- 단위 테스트 `test/review-loop.test.ts` 12개 통과 (검토 반영 1차 5개, 2차 사례 확장 포함) (프롬프트 블록, `splitVerdicts`, `normalizePlan` wiring, `unwiredConsumers`, `normalizeResult.reviewedCommit`, git 조상 판정 `headCommit`/`isAncestor`).
- 전체 `npm test`: 174개 중 173개 통과. 남은 실패 1건은 수정 전 기준선에도 있던 WIP 실패다: `retry.test` "R-PLAN으로 반송하면 계획부터 다시 돌고 복사본을 기준점으로 되돌린다" (codex-plan readiness gate가 human 대신 error로 세움). 이번 수정과 무관.
- `verify.test` review-first 시나리오 5개(pass · claude-reject · codex-reject · test-fail · source-change) 통과. claude-reject/codex-reject는 새 동작에 맞게 기대값을 바꿨다: 반대한 엔진에 AC-02만 재판정(세 번째 호출, `<재판정>` 블록 확인) → 고정 응답이라 여전히 갈림 → `VERIFY: human` + `result.reviewedCommit` 40자 기록.

## 검토 반영 (2026-09-18, 같은 날 코드 검토 4건)

검토자가 로컬 재현으로 지적한 문제를 확인했고 모두 실제였다. 각각 고치고 단위 테스트를 붙였다.

1. **Codex 재판정 응답이 버려짐.** 재판정은 갈린 조건만 답하라고 요구하면서 `askCodexJudgement`의 응답 검사는 전체 조건을 요구했다. `judgementsComplete(parsed, ask)`로 분리해 `tieBreak`가 있으면 그 조건만 요구한다.
2. **분할 심사에 초점이 전달되지 않음 · 원문 증거 누락.** `SegmentedReviewAsk.focus`(직전 반려 사유 + 재판정 조건)를 조각 프롬프트에 `<검토 초점>` 데이터 블록으로 싣는다(프롬프트가 달라지므로 관찰 캐시는 재사용되지 않는다). 최종 원문 증거 `referencedPatchEvidence`는 초점 조건의 관찰과 반려 사유가 가리키는 파일을 파일 순서와 무관하게 먼저 담고, 예산을 6만 자에서 12만 자로 올렸다. 나머지 파일은 원래 순서다.
3. **소비처 연결 검사가 느슨함.** 파일이 바뀌었다는 사실은 더 이상 연결이 아니다. `from` 파일의 주석과 문자열 리터럴을 지운 코드에 `to` 심볼이 식별자 경계로 등장할 때만 연결로 본다(`useKickAll`은 `useKick`이 아니고, import 경로 문자열도 아니다).
4. **Claude 단독 반려가 재검사 사유에서 빠짐 · delta 미발동.** 심사 우선 모드에서 Claude만 반려한 R-IMPL은 Codex 기록에 없어 `priorRejectReasons`가 비었고, delta 조건이 `priorReasons`를 요구해 발동하지 않았다. 직전 결과가 R-IMPL이면 `claudeRejectReasons(result.perAc)`를 사유에 합치고, delta는 `reviewedCommit`이 HEAD의 조상이면 사유 유무와 무관하게 발동한다.

검토에서 언급된 `result/reverify` API는 이 엔진에 없고 이번 범위에 넣지 않았다. 현재 BF `state.json`에는 `reviewedCommit`이 없어 다음 재검사 한 번은 전체 심사다(초점 블록과 우선 원문 증거는 그때부터 적용). 그 심사가 HEAD를 기록하면 그다음부터 delta다. 사람이 BF의 `result.reviewedCommit`을 6회차 심사 후보 `765bf674…`로 채우면 첫 재검사부터 delta로 갈 수 있다.

## 검토 반영 2차 (2026-09-18, 같은 날 두 번째 검토)

세 지적 모두 코드로 재확인했고 실제였다.

1. **같은 후보 재심은 delta가 아니다.** 코드가 `previous !== head`를 요구하므로 `reviewedCommit`이 HEAD와 같으면 전체 심사였다. 이제 직전 심사 후보가 HEAD와 **같으면** patch는 전체지만 `<같은 후보 재심>` 블록으로 직전 판정을 승계하고 직전 반려 조건만 다시 판정하게 한다. 로그: `판정 입력 — 같은 후보 <sha> 재심 · 전체 patch · 직전 yes 판정 승계`. 새 구현 커밋이 얹히면 그때부터 `<되감기 delta>`다.
2. **Claude 반려 사유가 정상 재시도에서 빠짐.** `returnCode === "R-IMPL"` 조건을 걸었는데 되감기(`retry.ts:430`)와 구현 완료가 `returnCode`를 null로 지운다. 조건을 없앴다 — 직전 결과의 `perAc[].ai`가 non-yes면 항상 사유에 넣는다(통과한 결과에는 non-yes가 없다).
3. **import만 하고 쓰지 않아도 연결로 통과.** `stripImports`를 추가해 `import … from`, `import '…'`, `export … from`, `const {…} = require(…)` 선언을 지운 뒤 심볼을 찾는다. 단위 테스트에 import-only·require-only 사례 추가.

BF `state.json`의 `result.reviewedCommit` 직접 편집은 사용자 지시("해라")로 수행했다. 개선안 5번의 "state.json 직접 수정을 복구 수단으로 요구하지 않는다"와 어긋나는 예외이며, 값은 워크트리 HEAD(6회차 심사 후보 `765bf674…`)와 일치함을 확인했다. 이 값으로 BF의 다음 검사는 `<같은 후보 재심>`(직전 판정 승계 + 초점 우선 증거)이고, 구현 커밋이 하나 얹히면 delta다. 되돌리려면 그 한 줄을 지우면 된다.

전체 `npm test` 실패 해석(원본 로그 `tasks/*.output` 기준): 실패로 보고되는 항목은 `retry.test` "R-PLAN으로 반송하면…" 1건이며 기준선(수정 전) 로그에도 같은 항목이 있다. 출력 앞부분의 `tests 1 / fail 1` 블록은 `retry-context.test.ts:129`가 `fail.test.js`(일부러 exit 7)를 실행기로 돌리는 fixture의 중첩 출력이고 스위트 실패가 아니다.

## 남은 것 / 하지 않은 것

- 기존 슬라이스(F-21 포함)의 계획에는 `wiring`이 없다. 3번의 기계 검사는 새로 계획하는 슬라이스부터 걸린다.
- 모니터 세션의 비공식 수리 층 정리, 재시도 3회 소진 후 사람 재시도 반복은 운영 규칙이며 코드로 바꾸지 않았다.
- delta 심사에서 `partial` 조건의 회귀 여부는 여전히 모델 판정이다. 기계적 회귀 검출은 아니다.
