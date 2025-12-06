# fastPort Deployment Guide

## Production Deployment

### Prerequisites

- Node.js 18+ installed
- Reverse proxy (nginx/Apache) recommended
- SSL certificate for secure WebSocket (wss://)
- Firewall configured to allow WebSocket connections

### Basic Deployment

1. **Clone and Install**
```bash
git clone <your-repo>
cd fastPort
npm install --production
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Run with PM2** (recommended)
```bash
npm install -g pm2
pm2 start src/server.js --name fastport
pm2 save
pm2 startup
```

### Nginx Configuration

```nginx
upstream fastport {
    server localhost:3000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # REST API
    location /api/ {
        proxy_pass http://fastport;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location / {
        proxy_pass http://fastport;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### Docker Deployment

**Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

EXPOSE 3000

CMD ["node", "src/server.js"]
```

**docker-compose.yml**
```yaml
version: '3.8'

services:
  fastport:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
```

Build and run:
```bash
docker-compose up -d
```

### Kubernetes Deployment

**deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fastport
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fastport
  template:
    metadata:
      labels:
        app: fastport
    spec:
      containers:
      - name: fastport
        image: your-registry/fastport:latest
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: fastport-service
spec:
  selector:
    app: fastport
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

Apply:
```bash
kubectl apply -f deployment.yaml
```

## Scaling Considerations

### Horizontal Scaling

Since fastPort uses in-memory storage, horizontal scaling requires session affinity:

**Option 1: Session Affinity (Sticky Sessions)**
```nginx
upstream fastport {
    ip_hash;  # Route same IP to same server
    server server1:3000;
    server server2:3000;
    server server3:3000;
}
```

**Option 2: Session-Based Routing**
Route clients to specific servers based on session name:
```nginx
map $http_session_name $backend {
    "session1" server1:3000;
    "session2" server2:3000;
    default server3:3000;
}
```

**Option 3: Redis Adapter (Future Enhancement)**
Implement Redis pub-sub for cross-server message routing.

### Vertical Scaling

- Increase Node.js memory: `node --max-old-space-size=4096 src/server.js`
- Use clustering: Implement Node.js cluster module
- Monitor memory usage and set appropriate limits

## Monitoring

### Health Check Endpoint

Add to `src/server.js`:
```javascript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### PM2 Monitoring
```bash
pm2 monit
pm2 logs fastport
```

### Prometheus Metrics (Optional)

Install `prom-client`:
```bash
npm install prom-client
```

Add metrics endpoint:
```javascript
import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

## Security Best Practices

1. **Use HTTPS/WSS in Production**
   - Never use unencrypted WebSocket in production
   - Get SSL certificate from Let's Encrypt

2. **Rate Limiting**
   ```javascript
   import rateLimit from 'express-rate-limit';
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100
   });
   
   app.use('/api/', limiter);
   ```

3. **CORS Configuration**
   ```javascript
   import cors from 'cors';
   
   app.use(cors({
     origin: ['https://your-domain.com'],
     credentials: true
   }));
   ```

4. **Helmet for Security Headers**
   ```javascript
   import helmet from 'helmet';
   app.use(helmet());
   ```

5. **Environment Variables**
   - Never commit `.env` files
   - Use secrets management (AWS Secrets Manager, etc.)
   - Rotate secret keys regularly

## Backup and Recovery

### Session Data Backup

Since sessions are in-memory, implement periodic backup:

```javascript
// Add to sessionManager.js
exportSessions() {
  return JSON.stringify(Array.from(this.sessions.entries()));
}

importSessions(data) {
  const sessions = JSON.parse(data);
  this.sessions = new Map(sessions);
}
```

Schedule backups:
```bash
# Cron job to backup sessions
0 * * * * curl http://localhost:3000/api/backup > /backups/sessions-$(date +\%Y\%m\%d-\%H\%M).json
```

## Performance Tuning

### Node.js Optimization

```bash
# Increase event loop capacity
node --max-old-space-size=4096 \
     --max-semi-space-size=64 \
     src/server.js
```

### WebSocket Tuning

```javascript
const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false,  // Disable compression for speed
  maxPayload: 1024 * 1024    // 1MB max message size
});
```

### OS-Level Tuning

```bash
# Increase file descriptors
ulimit -n 65536

# TCP tuning
sysctl -w net.core.somaxconn=4096
sysctl -w net.ipv4.tcp_max_syn_backlog=4096
```

## Troubleshooting

### High Memory Usage
- Check for memory leaks with `node --inspect`
- Monitor active connections
- Implement connection limits
- Clear expired messages more aggressively

### Connection Drops
- Check firewall/proxy timeout settings
- Implement heartbeat/ping-pong
- Increase proxy read timeout

### Slow Message Delivery
- Check retry intervals
- Monitor server CPU usage
- Reduce message size
- Implement message compression

## Maintenance

### Zero-Downtime Updates

1. Use PM2 cluster mode:
```bash
pm2 start src/server.js -i max
pm2 reload all
```

2. Or use blue-green deployment with load balancer

### Log Rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Cost Optimization

### AWS Deployment
- Use t3.small or t3.medium instances
- Enable auto-scaling based on CPU
- Use Application Load Balancer with WebSocket support
- Consider Fargate for containerized deployment

### Resource Estimates
- 1000 concurrent connections: ~512MB RAM
- 10,000 messages/sec: ~1 CPU core
- Storage: Minimal (in-memory only)

## Support and Monitoring

Set up alerts for:
- High memory usage (>80%)
- High CPU usage (>80%)
- Connection errors
- Message delivery failures
- Server downtime

Use tools like:
- Datadog
- New Relic
- Grafana + Prometheus
- CloudWatch (AWS)
