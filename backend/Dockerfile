FROM node:20-alpine

ARG UID=999
ARG GID=1000

# better-sqlite3 needs python/make to build native bindings
RUN apk add --no-cache python3 make g++

# Create group and user matching the host (delete conflicting ids first)
RUN delgroup $(getent group ${GID} | cut -d: -f1) 2>/dev/null; \
    deluser $(getent passwd ${UID} | cut -d: -f1) 2>/dev/null; \
    addgroup -g ${GID} appgroup && \
    adduser -u ${UID} -G appgroup -s /bin/sh -D appuser

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

RUN mkdir -p data uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000
CMD ["node", "src/index.js"]
