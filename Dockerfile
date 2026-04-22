FROM node:20-alpine

WORKDIR /app

# Install dependencies and sudo
RUN apk add --no-cache sudo

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Build React frontend
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# Copy server
COPY server/ ./server/
COPY .env.example .env.example

# Data directory (mount a volume here)
RUN mkdir -p /data/uploads

EXPOSE 3000

ENV PORT=3000
ENV DB_PATH=/data/repairshop.sqlite
ENV UPLOADS_PATH=/data/uploads
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
