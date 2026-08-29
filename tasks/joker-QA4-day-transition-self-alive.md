# Joker QA4 — 다음 낮 생존자 UI 잠금 복구

## 배경

10인 실제 브라우저 E2E에서 1일차 재판과 밤 판정 뒤 2일차로 넘어갔을 때, 서버 스냅샷은 브라우저 계정을 생존자로 보고했지만 UI는 사망자로 판정해 낮 준비·투표를 모두 막았다.

## 재현

1. 10인 방에서 전원 준비 후 게임을 시작한다.
2. 1일차 낮 재판으로 한 명을 처형한다.
3. 밤 행동과 밤 판정을 완료해 2일차 낮으로 전환한다.
4. 처형·밤 사망 대상이 아닌 브라우저 계정의 서버 snapshot `isAlive`와 UI 조작 가능 여부를 비교한다.

## 요구사항

- `tribunal_vote_resolved`, `night_result_applied`, `day_phase_changed`를 순서대로 적용해도 각 플레이어와 self의 생존 상태가 canonical 서버 상태와 일치해야 한다.
- 서버 snapshot에서 self가 생존이면 다음 낮의 `투표 시작 준비`, 대상 선택, 투표 제출이 활성화되어야 한다.
- 실제 사망한 self만 낮 조작이 비활성화되어야 한다.
- 이벤트 유실·재연결 시 `get_session_snapshot` 복구도 같은 생존 상태를 만들어야 한다.
- 다른 플레이어의 역할이나 밤 행동 비밀은 클라이언트 state 또는 로그에 새로 노출하지 않는다.

## 성공 조건

- 1일차 재판→밤 판정→2일차 낮 통합 테스트에서 생존 self는 조작 가능하고 사망 self만 잠긴다.
- 이벤트 순차 적용 결과와 동일 시점의 session snapshot 적용 결과가 동등하다.
- 관련 ingame store/hook 테스트, frontend 전체 테스트, production build가 통과한다.
- 10인 실제 브라우저 재검증에서 서버상 생존 계정이 2일차 준비와 투표를 수행하며 스크린샷을 남긴다.

## 예상 범위

- `frontend/src/domains/game/ingame/store/applySessionSnapshot.js`
- `frontend/src/domains/game/ingame/store/applyTribunalResolved.js`
- `frontend/src/domains/game/ingame/store/ingameStore.js`
- `frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js`
- 관련 store/hook 통합 테스트

backend 규칙·DB schema/migration은 변경하지 않는다.
