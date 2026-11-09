# 문제 목록 — 상점(store)

| 번호 | 시험 이름 | 재현 순서 | 기대 | 실제 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|---|
| S-1 | 플레이어 카드를 사면 → 장부에 상점 구매 -500 줄이 남고 거래 내역에도 보임 | 골드 넣기 → 상점 → 플레이어 카드 가면 구매 → 완료 → 인게임 재화 분류 | 거래 내역에 "상점 구매 골드 -500" 줄 | 거래 내역이 구매 전 그대로 (새로 고쳐야 보임). 장부(DB)엔 줄 있음 | frontend/src/domains/store/store/storePurchase.store.js:28 (일반 구매 refresh가 fetchSummary만, currencyHistory.load 안 부름) | 낮음 | → 고침(c7e08539)
| S-2 | (시험 중 발견) 거래 내역 이유 글자 | 쿠폰 쓰기·관리자 지급 뒤 인게임 재화 → 거래 내역 | "쿠폰 보상" 같은 우리말 | `COUPON_REWARD`·`REWARD` 영어 코드 그대로 보임 | frontend/src/domains/store/utils/currencyView.js:93 (HISTORY_REASONS에 COUPON_REWARD·REWARD 없음) | 낮음 | → 고침(c7e08539, 서버 이유 코드 전부 대조: COUPON_REWARD·REWARD·QA_TEST_GRANT_*·EVENT_COMPENSATION_GOLD 추가, 모르는 코드는 "기타")
| S-3 | (시험 중 발견) 새 계정 거래 내역 | 새 계정 → 상점 → 인게임 재화 | 거래 내역 없음 또는 의미 있는 줄 | "기본 지급 골드 0 잔액 0" 줄이 기본 아이템 수만큼(약 25줄) 거래 내역을 채움 | backend/services/economy/defaults.js (기본 지급 아이템마다 0골드 장부 줄) · 화면은 0원 줄 안 거름 | 낮음 |
