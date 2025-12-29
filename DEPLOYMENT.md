# Nexus Law - Deployment Guide

Complete deployment instructions for Nexus Law AI-First Legal Intelligence Platform.

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- **Nexus Stack services running** (GraphRAG, MageAgent, FileProcess)
- 4GB RAM minimum (8GB+ recommended)
- 10GB disk space

## Quick Start (Development)

### 1. Start Nexus Stack Services First

Ensure these services are running before starting Nexus Law:

```bash
# From project root
cd docker

# Start Nexus Stack (if not already running)
docker-compose -f docker-compose.nexus.yml up -d nexus-graphrag nexus-mageagent nexus-fileprocess

# Verify services are healthy
docker ps | grep nexus
```

Required services:
- `nexus-graphrag` (Port 9090) - Document DNA, semantic search, citation networks
- `nexus-mageagent` (Port 9080) - Multi-agent legal intelligence
- `nexus-fileprocess` (Port 9096) - Document processing

### 2. Configure Environment

```bash
cd services/nexus-law

# Copy example environment file
cp .env.example .env

# Edit .env and set your values
nano .env  # or your preferred editor
```

**Critical settings to change:**
```env
JWT_SECRET=your-long-random-secret-here-min-64-characters
DB_PASSWORD=your-strong-database-password
```

**Verify Nexus Stack URLs:**
```env
MAGEAGENT_URL=http://nexus-mageagent:9080
GRAPHRAG_URL=http://nexus-graphrag:9090
FILEPROCESS_URL=http://nexus-fileprocess:9096
```

### 3. Start Nexus Law Services

```bash
# From project root
cd docker

# Start Nexus Law services
docker-compose -f docker-compose.nexus-law.yml up -d

# Watch logs
docker-compose -f docker-compose.nexus-law.yml logs -f nexus-law-api
```

### 4. Verify Deployment

```bash
# Health check
curl http://localhost:9200/health

# Detailed health (includes Nexus Stack status)
curl http://localhost:9200/health/detailed
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "database": { "healthy": true },
    "redis": { "healthy": true },
    "nexusStack": {
      "mageAgent": { "healthy": true, "latency": 45 },
      "graphRAG": { "healthy": true, "latency": 52 },
      "fileProcess": { "healthy": true, "latency": 38 }
    }
  }
}
```

### 5. Test with Demo Account

```bash
# Login with demo account
curl -X POST http://localhost:9200/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@nexuslaw.ai",
    "password": "demo123456"
  }'

# Save the token from response
TOKEN="<your-jwt-token>"

# Test legal research
curl -X POST http://localhost:9200/api/research \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Is a non-compete clause enforceable in California?",
    "maxAgents": 5,
    "context": {
      "jurisdiction": "us-ca",
      "focusAreas": ["employment_law"]
    }
  }'
```

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Nexus Law API | 9200 | REST API + WebSocket |
| PostgreSQL | 9201 | Database |
| Redis | 9202 | Cache |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Nexus Law Platform                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌─────────────┐    ┌───────────────┐  │
│  │  API Gateway │───▶│  PostgreSQL │    │     Redis     │  │
│  │  (Port 9200) │    │  (Port 9201)│    │  (Port 9202)  │  │
│  └──────┬───────┘    └─────────────┘    └───────────────┘  │
│         │                                                    │
│         │  Integrates with Nexus Stack:                     │
│         │                                                    │
│         ├──────────────▶ MageAgent (Port 9080)              │
│         │                Multi-agent legal research          │
│         │                                                    │
│         ├──────────────▶ GraphRAG (Port 9090)               │
│         │                Document DNA, citation networks     │
│         │                                                    │
│         └──────────────▶ FileProcess (Port 9096)            │
│                          Document processing                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout (blacklist token)

### Legal Research (MageAgent)
- `POST /api/research` - Multi-agent legal research
- `GET /api/research/:taskId` - Get task status
- `POST /api/research/memo` - Generate legal memo
- `POST /api/research/predict` - Predictive case outcome

### Document Processing (FileProcess)
- `POST /api/documents/process` - Process single document
- `POST /api/documents/process/batch` - Batch processing
- `GET /api/documents/jobs/:jobId` - Get job status
- `POST /api/documents/classify` - Classify document
- `POST /api/documents/extract/metadata` - Extract metadata

### Citations (GraphRAG)
- `POST /api/citations/network` - Build citation network
- `GET /api/citations/:caseId/analysis` - Citation analysis
- `POST /api/citations/similar` - Find similar cases
- `POST /api/citations/temporal` - Temporal queries

### Queries (GraphRAG)
- `POST /api/queries/semantic` - Semantic search
- `POST /api/queries/hybrid` - Hybrid search
- `POST /api/queries/graph` - Knowledge graph queries

## WebSocket Events

Connect to `ws://localhost:9200` with JWT auth:

```javascript
const socket = io('http://localhost:9200', {
  auth: { token: 'your-jwt-token' }
});

// Subscribe to research task
socket.emit('research:subscribe', { taskId: 'task_123' });
socket.on('research:progress', (data) => console.log('Progress:', data));
socket.on('research:complete', (data) => console.log('Complete:', data));

// Subscribe to document batch
socket.emit('documents:subscribe', { jobId: 'job_456' });
socket.on('documents:progress', (data) => console.log('Progress:', data));
socket.on('documents:complete', (data) => console.log('Complete:', data));
```

## Production Deployment

### Security Checklist

- [ ] Change `JWT_SECRET` to strong random string (64+ characters)
- [ ] Change `DB_PASSWORD` to strong unique password
- [ ] Restrict `CORS_ORIGIN` to your frontend domains
- [ ] Enable HTTPS (use reverse proxy like Nginx)
- [ ] Set `NODE_ENV=production`
- [ ] Configure firewall rules
- [ ] Enable database backups
- [ ] Rotate API keys regularly
- [ ] Monitor logs and metrics
- [ ] Set up alerting

### Environment Variables (Production)

```env
NODE_ENV=production
JWT_SECRET=<64-character-random-string>
DB_PASSWORD=<strong-password>
CORS_ORIGIN=https://your-frontend-domain.com
```

### Backup Database

```bash
# Backup PostgreSQL
docker exec nexus-law-db pg_dump -U nexus_law_user nexus_law > backup.sql

# Restore
docker exec -i nexus-law-db psql -U nexus_law_user nexus_law < backup.sql
```

### Monitoring

```bash
# View logs
docker-compose -f docker-compose.nexus-law.yml logs -f nexus-law-api

# Container stats
docker stats nexus-law-api nexus-law-db nexus-law-redis

# Health checks
watch -n 5 curl -s http://localhost:9200/health/detailed
```

## Troubleshooting

### API Gateway won't start

Check Nexus Stack services:
```bash
docker ps | grep nexus
curl http://localhost:9080/health  # MageAgent
curl http://localhost:9090/health  # GraphRAG
curl http://localhost:9096/health  # FileProcess
```

### Database connection failed

```bash
# Check PostgreSQL is running
docker logs nexus-law-db

# Test connection
docker exec nexus-law-db psql -U nexus_law_user -d nexus_law -c "SELECT 1"
```

### Redis connection failed

```bash
# Check Redis is running
docker logs nexus-law-redis

# Test connection
docker exec nexus-law-redis redis-cli ping
```

### WebSocket not connecting

- Verify JWT token is valid
- Check CORS settings
- Ensure port 9200 is accessible

### Nexus Stack service unavailable

The API Gateway will continue to function with degraded capabilities if Nexus Stack services are unavailable. Check circuit breaker status:

```bash
curl http://localhost:9200/health/detailed | jq '.circuitBreakers'
```

## Performance Tuning

### PostgreSQL

Already optimized for legal workloads:
- `max_connections=200`
- `shared_buffers=256MB`
- `effective_cache_size=1GB`

For high-traffic deployments, adjust in docker-compose.yml.

### Redis

Already configured with:
- `maxmemory=512mb`
- `maxmemory-policy=allkeys-lru`

Increase for larger caches.

### API Gateway

Adjust rate limits:
```env
RATE_LIMIT_MAX=500  # Increase for high traffic
```

## Scaling

### Horizontal Scaling (Multiple API Gateways)

```yaml
# docker-compose.nexus-law.yml
services:
  nexus-law-api:
    deploy:
      replicas: 3
```

Use load balancer (Nginx, HAProxy, or AWS ALB).

### Vertical Scaling

Increase container resources:
```yaml
services:
  nexus-law-api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

## Support

For issues or questions:
- Check logs: `docker-compose logs -f nexus-law-api`
- Health check: `curl http://localhost:9200/health/detailed`
- GitHub Issues: https://github.com/adverant/Adverant-Nexus/issues
