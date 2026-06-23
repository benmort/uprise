# 7. Infrastructure / Deployment Architecture

This document outlines how the Yarns system is deployed and managed across different environments, including containerization, orchestration, cloud provider setup, and deployment strategies.

## Environment Overview

### Environment Strategy

#### Development Environment
**Purpose**: Local development and testing
**Access**: Developer workstations
**Resources**: Minimal resource allocation

**Characteristics**:
- Local Docker Compose setup
- Hot reload for rapid development
- Shared development database
- Mock external services (Stripe, SendGrid)

#### Staging Environment
**Purpose**: Pre-production testing and validation
**Access**: CI/CD pipelines and QA team
**Resources**: Production-like configuration

**Characteristics**:
- Production-like infrastructure
- Real external service integrations
- Automated testing before production
- Performance and load testing

#### Production Environment
**Purpose**: Live customer-facing application
**Access**: Restricted to operations team
**Resources**: Auto-scaling based on demand

**Characteristics**:
- High availability and redundancy
- Disaster recovery capabilities
- Real-time monitoring and alerting
- Automated scaling and optimization

### Environment-Specific Configurations

#### Configuration Management Strategy
```typescript
// Environment-based configuration loading
const config = {
  development: {
    database: { url: 'postgresql://localhost:5432/yarns_dev' },
    redis: { url: 'redis://localhost:6379' },
    external: {
      stripe: { publishableKey: 'pk_test_...' },
      sendgrid: { apiKey: 'SG.test_...' },
    },
  },
  staging: {
    database: { url: process.env.DATABASE_URL },
    redis: { url: process.env.REDIS_URL },
    external: {
      stripe: { publishableKey: process.env.STRIPE_PUBLISHABLE_KEY },
      sendgrid: { apiKey: process.env.SENDGRID_API_KEY },
    },
  },
  production: {
    database: { url: process.env.DATABASE_URL },
    redis: { url: process.env.REDIS_URL },
    external: {
      stripe: { publishableKey: process.env.STRIPE_PUBLISHABLE_KEY },
      sendgrid: { apiKey: process.env.SENDGRID_API_KEY },
    },
  },
};
```

**Configuration Benefits**:
- Type-safe configuration management
- Environment-specific overrides
- Secrets management integration
- Validation and runtime checks

## Containerization Strategy

### Docker Architecture

#### Multi-Stage Builds
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
RUN npm ci --only=production

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

**Build Optimization**:
- Multi-stage builds for smaller images
- Dependency optimization and caching
- Security scanning in CI/CD
- Base image vulnerability management

#### Service-Specific Dockerfiles

##### API Gateway Service
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000
CMD ["npm", "run", "start:api-gateway"]
```

##### Event Streaming Service
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f https://http-event-bridge.service.dev.yarns.network/health || exit 1

EXPOSE 8001
CMD ["npm", "run", "start:event-streaming"]
```

**Health Check Strategy**:
- Service-specific health endpoints
- Dependency health verification
- Graceful shutdown handling
- Kubernetes readiness probes

## Kubernetes Deployment Architecture

### Cluster Architecture

#### Namespace Organization
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: yarns-production
  labels:
    environment: production
    team: platform
```

**Namespaces**:
- `yarns-production`: Production workloads
- `yarns-staging`: Staging environment
- `monitoring`: Observability stack
- `ingress-nginx`: Ingress controllers

#### Node Pool Strategy
- **Application Nodes**: General-purpose workloads
- **Memory-Optimized**: Database and cache workloads
- **CPU-Optimized**: Compute-intensive services
- **Spot Instances**: Non-critical batch jobs

### Service Deployment Patterns

#### Deployment Configuration
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  namespace: yarns-production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
      - name: user-service
        image: yarns-user-service:latest
        ports:
        - containerPort: 3007
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: url
        livenessProbe:
          httpGet:
            path: /health
            port: 3007
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readiness
            port: 3007
          initialDelaySeconds: 5
          periodSeconds: 5
```

**Deployment Features**:
- Horizontal Pod Autoscaling (HPA)
- Rolling updates with zero downtime
- ConfigMap for configuration management
- Secret management for sensitive data

#### Service Discovery
```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service
  namespace: yarns-production
spec:
  selector:
    app: user-service
  ports:
  - name: http
    port: 80
    targetPort: 3007
  type: ClusterIP
```

**Service Types**:
- ClusterIP for internal communication
- LoadBalancer for external traffic
- Headless for stateful services

### Ingress and Load Balancing

#### Ingress Configuration
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: yarns-ingress
  namespace: yarns-production
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.yarns.com
    - app.yarns.com
    secretName: yarns-tls
  rules:
  - host: api.yarns.com
    http:
      paths:
      - path: /api/(.*)
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 80
  - host: app.yarns.com
    http:
      paths:
      - path: /(.*)
        pathType: Prefix
        backend:
          service:
            name: admin-client
            port:
              number: 80
```

**Ingress Benefits**:
- SSL/TLS termination at edge
- Path-based routing to services
- Rate limiting and DDoS protection
- Global traffic management

## Cloud Provider Setup

### AWS Infrastructure (Primary)

#### VPC Architecture
```yaml
Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsSupport: true
      EnableDnsHostnames: true

  PublicSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.1.0/24
      AvailabilityZone: us-east-1a

  PrivateSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.2.0/24
      AvailabilityZone: us-east-1a
```

**Network Architecture**:
- Public subnets for load balancers and bastion hosts
- Private subnets for application and database tiers
- NAT gateways for outbound internet access
- Security groups for traffic control

#### RDS PostgreSQL Configuration
```yaml
Resources:
  Database:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceClass: db.t3.medium
      Engine: postgres
      EngineVersion: "15.3"
      AllocatedStorage: "100"
      StorageEncrypted: true
      MultiAZ: true
      DBSubnetGroupName: !Ref DatabaseSubnetGroup
      VPCSecurityGroups:
      - !Ref DatabaseSecurityGroup
```

**Database Features**:
- Multi-AZ for high availability
- Encrypted storage at rest
- Automated backup windows
- Read replica support for scaling

#### ElastiCache Redis Cluster
```yaml
Resources:
  RedisCluster:
    Type: AWS::ElastiCache::ReplicationGroup
    Properties:
      ReplicationGroupId: yarns-redis-cluster
      ReplicationGroupDescription: Redis cluster for Yarns
      NumCacheClusters: 3
      Engine: redis
      EngineVersion: "7.0"
      CacheNodeType: cache.t3.medium
      MultiAZEnabled: true
```

**Redis Features**:
- Multi-AZ replication for durability
- Automatic failover capabilities
- Cluster mode for horizontal scaling
- Encryption in transit and at rest

### Secrets Management

#### AWS Secrets Manager Integration
```typescript
// Secrets retrieval and caching
class SecretsManager {
  private cache = new Map<string, any>();

  async getSecret(secretName: string): Promise<any> {
    if (this.cache.has(secretName)) {
      return this.cache.get(secretName);
    }

    const client = new SecretsManagerClient({});
    const response = await client.getSecretValue({
      SecretId: secretName,
    });

    const secret = JSON.parse(response.SecretString || '{}');
    this.cache.set(secretName, secret);

    return secret;
  }
}
```

**Secrets Strategy**:
- AWS Secrets Manager for secure storage
- Automatic secret rotation
- Least privilege access patterns
- Audit logging for secret access

## Deployment Strategy

### CI/CD Pipeline Architecture

#### GitHub Actions Workflow
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    - run: npm ci
    - run: npm run test
    - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
    - uses: actions/checkout@v3
    - uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-region: us-east-1
    - run: npm run deploy:production
```

**Pipeline Stages**:
1. **Code Quality**: Linting, type checking, security scanning
2. **Testing**: Unit tests, integration tests, E2E tests
3. **Building**: Docker image creation and optimization
4. **Deployment**: Rolling updates with health checks
5. **Verification**: Post-deployment testing and monitoring

### Blue-Green Deployment Strategy

#### Implementation Approach
```yaml
# Blue environment (current production)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service-blue
  namespace: yarns-production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
      version: blue

# Green environment (new version)
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service-green
  namespace: yarns-production
spec:
  replicas: 1
  selector:
    matchLabels:
      app: user-service
      version: green
```

**Deployment Process**:
1. Deploy green environment with new version
2. Run integration tests on green environment
3. Gradually shift traffic from blue to green
4. Monitor error rates and performance
5. Complete rollout or rollback if issues detected

### Rolling Update Strategy

#### Zero-Downtime Updates
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  replicas: 5
```

**Update Process**:
- Gradual pod replacement (max 1 unavailable)
- New pods created before old ones terminated
- Health checks ensure new pods are ready
- Automatic rollback on health check failures

## Monitoring and Alerting Infrastructure

### Prometheus and Grafana Stack

#### Prometheus Configuration
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
- job_name: 'user-service'
  static_configs:
  - targets: ['user-service:3007']
  metrics_path: '/metrics'
  scrape_interval: 15s

- job_name: 'api-gateway'
  static_configs:
  - targets: ['api-gateway:8000']
  metrics_path: '/metrics'
  scrape_interval: 15s
```

**Metrics Collection**:
- Service-specific business metrics
- System resource utilization
- Custom application metrics
- External service integration metrics

#### Grafana Dashboard Configuration
```json
{
  "dashboard": {
    "title": "Yarns Service Health",
    "panels": [
      {
        "title": "Service Response Times",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{service}} p95"
          }
        ]
      }
    ]
  }
}
```

**Dashboard Features**:
- Service health overview
- Performance metrics and trends
- Error rate monitoring
- Resource utilization charts

### Alerting Rules

#### Critical Alerts
```yaml
groups:
- name: critical_alerts
  rules:
  - alert: ServiceDown
    expr: up{job=~"user-service|api-gateway"} == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Service {{ $labels.job }} is down"
      description: "{{ $labels.job }} has been down for more than 2 minutes."

  - alert: HighErrorRate
    expr: rate(errors_total[5m]) / rate(requests_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ $value }} for {{ $labels.service }}"
```

**Alert Routing**:
- Email notifications for critical issues
- Slack integration for team alerts
- PagerDuty for on-call escalation
- JIRA ticket creation for tracking

## Backup and Disaster Recovery

### Database Backup Strategy

#### PostgreSQL Backups
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: postgres-backup
            image: postgres:15
            command:
            - /bin/bash
            - -c
            - |
              pg_dump -h $DB_HOST -U $DB_USER $DB_NAME > /backup/backup.sql
              aws s3 cp /backup/backup.sql s3://yarns-backups/$(date +%Y-%m-%d).sql
```

**Backup Strategy**:
- Daily full database backups
- Point-in-time recovery capability
- Cross-region backup replication
- Automated backup verification

### Disaster Recovery Plan

#### Recovery Time Objectives (RTO)
- **Critical Services**: < 15 minutes
- **Important Services**: < 1 hour
- **Standard Services**: < 4 hours

#### Recovery Point Objectives (RPO)
- **Critical Data**: < 5 minutes
- **Important Data**: < 1 hour
- **Standard Data**: < 24 hours

**DR Strategies**:
- Multi-region deployment for critical services
- Automated failover procedures
- Regular disaster recovery testing
- Data replication across regions

## Cost Optimization

### Auto-Scaling Configuration

#### Horizontal Pod Autoscaler
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: user-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: user-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**Scaling Policies**:
- CPU-based scaling for compute-intensive workloads
- Memory-based scaling for cache-heavy services
- Custom metrics for business-specific scaling
- Cooldown periods to prevent thrashing

### Spot Instance Strategy

#### Spot Instance Configuration
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: batch-jobs
spec:
  template:
    spec:
      nodeSelector:
        node-type: spot
      tolerations:
      - key: spot-instance
        operator: Equal
        value: "true"
        effect: NoSchedule
```

**Cost Optimization**:
- Use spot instances for fault-tolerant workloads
- Implement checkpointing for job recovery
- Graceful degradation during spot termination
- Mixed instance types for cost efficiency

## Security Infrastructure

### Network Security

#### Security Groups
```yaml
Resources:
  ApplicationSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Application tier security group
      VpcId: !Ref VPC
      SecurityGroupIngress:
      - IpProtocol: tcp
        FromPort: 3000
        ToPort: 3007
        SourceSecurityGroupId: !Ref LoadBalancerSecurityGroup
```

**Security Measures**:
- Least privilege access patterns
- Port-specific security group rules
- Regular security group audits
- Integration with AWS WAF for web protection

### Compliance and Audit Logging

#### CloudTrail Configuration
```yaml
Resources:
  CloudTrail:
    Type: AWS::CloudTrail::Trail
    Properties:
      Name: yarns-cloudtrail
      S3BucketName: !Ref CloudTrailBucket
      IncludeGlobalServiceEvents: true
      IsMultiRegionTrail: true
      EnableLogFileValidation: true
```

**Audit Features**:
- All API calls logged and monitored
- Data access pattern analysis
- Compliance reporting automation
- Security event correlation

## Performance Monitoring

### Application Performance Monitoring (APM)

#### Distributed Tracing Setup
```yaml
# OpenTelemetry Collector configuration
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  jaeger:
    endpoint: "jaeger-collector:14250"
  prometheus:
    endpoint: "prometheus:9090"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger, prometheus]
```

**APM Benefits**:
- End-to-end request tracing
- Performance bottleneck identification
- Service dependency mapping
- User experience monitoring

This comprehensive infrastructure and deployment architecture ensures reliable, scalable, and secure operation of the Yarns platform across all environments.
