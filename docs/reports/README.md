# 보고서 버전 안내

`Joker-additional-requirements-plan-20260913.docx`는 2026-09-13 작성한 초기 초안을 원본 그대로 보존한 문서다. 현재 실행 요구사항이 아니며, 전체 판수·승률 삭제 제안과 당시 검증 순서는 이후 사용자 확정으로 대체됐다.

추가 요구사항의 실행 기준은 `../requirements/2026-09-13-additional-execution-approved.md`, F30~F32 개별 요구사항, `../requirements/2026-09-14-f32-db-product-contract.md`다. F30은 전체 판수·승률을 남기며, F32 상품·가격·지급량은 외부 백엔드가 DB에 등록하고 게임 서버가 조회한다. F28은 최종 검증으로 마지막에 수행한다. v2 Word 보고서도 이후의 Markdown 보완보다 우선하지 않는다.

현재 검증 순서는 관련 회귀 시험 → Claude/Codex 독립 코드 심사 → 전체 시험/빌드 → 실제 외부 Chrome UI → 정상 승인/병합이다. 상세 운영 기준은 `../requirements/2026-09-13-heavy-task-preflight.md`를 따른다.
