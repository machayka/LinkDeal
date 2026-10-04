# Obraz Caddy z gotową aplikacją umów. Najpierw budujemy app/ (Node), potem kopiujemy same pliki.
FROM node:24-alpine AS app
WORKDIR /app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
# Adres RPC jest wpisywany w pliki aplikacji przy budowaniu (widoczny w przeglądarce).
ARG PUBLIC_RPC_URL
ENV PUBLIC_RPC_URL=$PUBLIC_RPC_URL
ARG PUBLIC_CHAT_URL
ENV PUBLIC_CHAT_URL=$PUBLIC_CHAT_URL
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=app /app/dist /srv/app
