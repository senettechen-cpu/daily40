# ---- 建置階段 ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- 執行階段 ----
FROM node:22-alpine
WORKDIR /app

# 注意：這裡刻意不設 NODE_ENV=production。
# src/db/index.ts 會在 NODE_ENV === 'production' 時對資料庫啟用 SSL，
# 而 Zeabur 內網的 PostgreSQL 不支援 SSL，設了會連不上。
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
