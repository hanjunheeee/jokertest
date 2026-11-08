# build context는 저장소 루트입니다(docker-compose.yml의 context: .).
# 그래서 아래 COPY 경로는 모두 backend/ 접두사를 붙입니다 — frontend/Dockerfile과 같은 규칙입니다.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 의존성 설치를 소스 복사보다 먼저 두면, 소스만 바뀐 재빌드에서 이 레이어가 캐시됩니다.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./

# 로그 폴더는 node 사용자가 쓸 수 있게 (compose가 여기에 backend_logs 볼륨을 붙임)
RUN mkdir -p /app/logs && chown node:node /app/logs

# 앱은 PORT가 없으면 4000을 씁니다(backend/index.js). 문서 목적의 선언입니다.
EXPOSE 4000

# 표는 마이그레이션만 만듦 → 서버보다 migrate 먼저 (실패하면 서버 안 켬)
# migrate 끝나면 exec로 셸을 node로 바꿈 → node가 PID 1, docker stop의 SIGTERM이 바로 닿음
# 여러 대 동시에 켜도 migrate는 DB 잠금으로 한 번에 하나만 돎
USER node
CMD ["sh", "-c", "node scripts/migrate-db.js migrate && exec node index.js"]
