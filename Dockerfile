# 微信云托管用镜像
# 说明：云托管容器无持久磁盘，data/ 变化会在重启后丢失。
# 试用阶段把当前数据库打进镜像，正式使用需改为云数据库或挂载存储。

FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates sqlite3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 80

CMD ["pnpm", "start"]
