# build context는 저장소 루트입니다(docker-compose.yml의 context: .).
# 그래서 아래 COPY 경로는 모두 backend/ 접두사를 붙입니다 — frontend/Dockerfile과 같은 규칙입니다.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 의존성 설치를 소스 복사보다 먼저 두면, 소스만 바뀐 재빌드에서 이 레이어가 캐시됩니다.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./

# 앱은 PORT가 없으면 4000을 씁니다(backend/index.js). 문서 목적의 선언입니다.
EXPOSE 4000

# npm을 거치지 않고 node를 PID 1로 띄웁니다. docker stop의 SIGTERM이 중간 셸에
# 가로막히지 않고 프로세스까지 그대로 전달됩니다.
USER node
CMD ["node", "index.js"]
