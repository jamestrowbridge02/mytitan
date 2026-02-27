FROM node:20-bullseye-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE=${NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE}
RUN mkdir -p public
RUN npm run build

FROM node:20-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3001
CMD ["npm", "run", "start", "--", "-p", "3001"]
