# Multi-stage build for Nexus Law API Service
# Handles nested service structure (services/nexus-law/services/api-gateway)

# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package management files
COPY package.json ./
COPY tsconfig.json ./

# Copy all packages first (for workspace dependencies)
COPY packages/ ./packages/

# Copy all nested services
COPY services/ ./services/

# Install root dependencies first
RUN npm install --legacy-peer-deps 2>/dev/null || npm install

# Build packages in order (types -> shared -> adapters)
WORKDIR /app/packages/types
RUN npm run build 2>/dev/null || npx tsc

WORKDIR /app/packages/shared
RUN npm run build 2>/dev/null || npx tsc

WORKDIR /app/packages/adapters
RUN npm run build 2>/dev/null || npx tsc --skipLibCheck

# Build API gateway service
WORKDIR /app/services/api-gateway
RUN npm run build 2>/dev/null || npx tsc --skipLibCheck

# ============================================================================
# Stage 2: Production
# ============================================================================
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nexus && \
    adduser -S -D -H -u 1001 -G nexus nexus

WORKDIR /app

# Copy node_modules from root
COPY --from=builder --chown=nexus:nexus /app/node_modules ./node_modules

# Copy built packages
COPY --from=builder --chown=nexus:nexus /app/packages/types/dist ./packages/types/dist
COPY --from=builder --chown=nexus:nexus /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nexus:nexus /app/packages/adapters/dist ./packages/adapters/dist

# Copy built application
COPY --from=builder --chown=nexus:nexus /app/services/api-gateway/dist ./dist
COPY --from=builder --chown=nexus:nexus /app/services/api-gateway/package.json ./

# Switch to non-root user
USER nexus

# Expose ports
# 9121: HTTP API server
# 9122: WebSocket server
EXPOSE 9121 9122

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9121/health/live', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start application with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
