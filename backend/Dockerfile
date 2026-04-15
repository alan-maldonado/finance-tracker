FROM node:20-alpine

# better-sqlite3 needs python/make/g++ to build native bindings.
# pymupdf is needed for the Liverpool PDF header fallback (balance, min payment, due date
# are stored in Form XObjects that our raw stream extractor can't coordinate-transform;
# PyMuPDF handles this correctly). --break-system-packages is required on Alpine 3.21+
# where pip enforces PEP 668 even inside a container.
RUN apk add --no-cache python3 py3-pip make g++ && \
    pip3 install --no-cache-dir --break-system-packages pymupdf

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

RUN mkdir -p data uploads

EXPOSE 3000
CMD ["node", "src/index.js"]
