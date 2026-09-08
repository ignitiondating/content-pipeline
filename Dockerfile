# Must match the version of the `playwright` npm package (package-lock).
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vendors a Linux FFmpeg build with libass into vendor/ffmpeg/.
RUN node scripts/setup-ffmpeg.mjs
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.62.1-jammy
WORKDIR /app
ENV NODE_ENV=production \
    CHROMIUM_NO_SANDBOX=1 \
    STATE_DIR=/data
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/data/migrations ./data/migrations
COPY --from=builder /app/vendor ./vendor
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
