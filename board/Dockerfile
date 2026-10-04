# Aplikacja ogłoszeń (Astro + Node). Budowana z katalogu głównego repo: docker build -f board/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /board
COPY board/package*.json ./
RUN npm ci
COPY board/ ./
# Adres aplikacji umów dla przycisku „Utwórz umowę” — wpisywany przy budowaniu.
ARG PUBLIC_APP_URL
ENV PUBLIC_APP_URL=$PUBLIC_APP_URL
RUN npm run build

FROM node:24-alpine
WORKDIR /board
COPY --from=build /board/node_modules ./node_modules
COPY --from=build /board/dist ./dist
ENV HOST=0.0.0.0 PORT=4321
CMD ["node", "dist/server/entry.mjs"]
