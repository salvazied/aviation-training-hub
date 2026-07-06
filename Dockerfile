FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./

RUN npm install

COPY . .

ENV NITRO_PRESET=node-server

RUN npm run build

ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
