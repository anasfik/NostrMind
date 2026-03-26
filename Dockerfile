FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json vitest.config.ts .
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY .env.example ./.env.example

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "dist/index.js"]
