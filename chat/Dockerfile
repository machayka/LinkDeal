FROM node:24-alpine
WORKDIR /chat
COPY chat/package*.json ./
RUN npm ci --omit=dev
COPY chat/server.mjs ./
COPY board/db/schema.sql /board/db/schema.sql
ENV CHAT_PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
