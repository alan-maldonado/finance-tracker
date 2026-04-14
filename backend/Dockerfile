FROM node:20-alpine

# better-sqlite3 needs python/make to build native bindings
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

RUN mkdir -p data uploads

EXPOSE 3000
CMD ["node", "src/index.js"]
