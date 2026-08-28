---
approval: plan
setup: npm ci --prefix backend
---

# joker-S1-3 · 프론트 턴 연동

## 확정 스펙 (전제)

- 프론트는 서버의 night_turn_started(role, deadline) / night_turn_ended(role) 이벤트만을 진실로 삼는다. 로컬 추정·자체 시계로 턴을 전환하지 않는다
- 죽은 직업 턴도 이벤트가 동일하게 오므로 프론트에 생존 분기가 없어야 한다

## 요구

1. "OO의 시간입니다" 안내·행동 패널 활성화를 로컬 추정이 아니라 night_turn_started 이벤트 기준으로 전환한다. 자기 직업의 턴에만 행동 UI를 활성화하고 나머지 턴에는 비활성화한다.
2. 상태바가 현재 턴 직업과 남은 시간(payload의 deadline 기반 카운트다운)을 표시한다.
3. 죽은 직업 턴도 동일하게 안내를 재생한다 — 이벤트가 동일하므로 프론트에 생존 여부 분기가 존재하지 않음을 확인한다.

## 성공 조건

- 안내·패널·상태바가 서버 턴과 일치한다 (5.1 / 5.5 / 11.4)
- 사망자·전멸 직업 턴에도 다른 플레이어 화면에 안내가 동일하게 재생된다 (5.2 / 11.6 완전 해소)
- 자기 턴이 아닐 때 행동 UI가 비활성이다

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 채팅 UI (S4)
- 백엔드 수정

## 자잘한 규칙

- 변경 범위: frontend ingame — selectInGameNightTurnRole.js, ingameNightTurnAnnouncement.js, ingameTimebarAssets.js, useInGameActionPanel 계열
