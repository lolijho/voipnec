# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --production
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./public
RUN mkdir -p /data
EXPOSE 3001
CMD ["node", "dist/index.js"]
