---
approval: plan
setup: npm ci --prefix backend
---

# joker-S1-2 · 타이머·타임아웃·설정 소비

## 확정 스펙 (전제)

- 타이머는 서버 단일 소유. deadline을 이벤트 payload로 내려주고, 프론트는 표시만 한다
- 시간 만료 시 미제출자는 **기권** 처리하고 다음 턴/페이즈로 진행한다
- 산 직업 전원 제출 시 즉시 진행 규칙(S1-1)은 유지 — 타이머는 상한일 뿐이다

## 요구

1. nightActionTime을 각 밤 턴의 제한시간으로 소비한다. 시간 만료 시 미제출 행동은 기권 처리하고 다음 턴으로 진행한다 (ACTIONS_PENDING 영구 대기 제거).
2. dayDiscussionTime / dayVoteTime을 joker-C의 DAY_DISCUSSION / DAY_VOTE 전환에 소비한다. 투표 시간 만료 시 미투표는 기권으로 집계한다.
3. 직업별 제한시간 설정을 지원한다: 설정 스키마에 직업별 값(없으면 nightActionTime 폴백)을 추가하고, 방 생성 검증(backend/utils/createRoomValidation.js)·소비까지 연결한다. 설정 UI 항목 추가 포함.
4. 죽은 직업 턴의 무작위 지연(S1-1)은 해당 직업의 제한시간 기준 20~60%로 계산한다.

## 성공 조건

- 밤 턴에서 아무도 제출하지 않아도 제한시간 후 게임이 진행된다 (5.3 / 9.2 — 소프트락 제거)
- 회의·투표 시간이 설정값대로 만료·전환된다 (2.3 / 2.4)
- 직업별 시간 설정이 UI에서 입력되고 실제 턴 길이에 반영된다 (2.6)
- 전원 제출 시에는 제한시간을 기다리지 않고 즉시 진행된다 (S1-1 규칙 유지 회귀 확인)

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 접속 끊김 유예 타이머 (S3)
- 프론트 턴 표시 (S1-3) — 설정 UI 항목 추가는 예외로 허용

## 자잘한 규칙

- 변경 범위: backend/game-core/gameSession.js, backend/utils/createRoomValidation.js, joker-C의 페이즈 전환부, 설정 UI
