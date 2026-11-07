#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
# 首先尝试正常安装（会编译 better-sqlite3）
# 如果失败，尝试使用预编译的二进制文件
if ! pnpm install --frozen-lockfile 2>&1; then
    echo "Normal install failed, trying with prebuild..."
    # 清理并重试
    rm -rf node_modules
    pnpm install --frozen-lockfile --ignore-scripts || true
    # 尝试下载预编译的 better-sqlite3
    cd node_modules/better-sqlite3 2>/dev/null && npx prebuild-install || true
    cd "${COZE_WORKSPACE_PATH}"
fi

echo "Building the Next.js project..."
# 设置构建环境变量，避免数据库初始化
export NEXT_PHASE=phase-production-build
export NODE_ENV=production
# 4 核服务器用 3 核构建（~75% CPU），不卡死就行
export NODE_OPTIONS="--max-old-space-size=1024"
export NEXT_TELEMETRY_DISABLED=1

# ⚠️ 重要：禁止 rm -rf .next/
# Next.js 会保留旧版内容寻址的静态资源（/_next/static/xxx-yyy.js）作为兼容层。
# 如果删掉 .next，之前缓存旧 HTML 的浏览器（尤其是微信内置浏览器）
# 会引用已不存在的 chunk → 404 → 白屏/崩溃。
#
# 如果确实需要强制全量清理，务必确认所有用户都能拿到最新 HTML，
# 或者配合 nginx 的 @reload_html 404 fallback 使用。
# rm -rf .next  # ← 绝对不要执行这行

# 3 核构建，nice 10 低优先级（别人能抢占但不极端），ionice idle
taskset -c 0-2 nice -n 10 ionice -c 3 pnpm next build

echo "Bundling server with tsup..."
# tsup 输出 dist/，每次重建前清理 dist/ 是安全的（server.js 不是静态资源）
rm -rf dist
taskset -c 0-2 nice -n 10 ionice -c 3 pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"
echo "Note: .next/static/chunks/ contains old chunks preserved for cache compatibility."
