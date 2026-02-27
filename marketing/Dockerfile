FROM node:20-bullseye-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
ARG NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1
ENV NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1=${NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1}
RUN npm run build

FROM node:20-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/next.config.js ./next.config.js
EXPOSE 3002
CMD ["npm", "run", "start", "--", "-p", "3002"]
