FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production && apk del python3 make g++

# Copy application
COPY . .

# Create data directory
RUN mkdir -p /app/data/uploads

EXPOSE 3000
ENV LIBRARY_PATH=/library

VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
