# 4. Data Flow / Request Lifecycle

This document describes the end-to-end journey of key interactions through the Foment system, showing how requests flow between components and how data is processed across the architecture.

## Request Lifecycle Overview

### Synchronous Request Flow Pattern
```
External Request → API Gateway → Service → Database → Response
```

### Asynchronous Event Flow Pattern
```
Service Action → Event Publishing → Event Streaming → Event Consumption → Side Effects
```

### Real-Time Update Flow Pattern
```
Service Action → Event Publishing → Platform API (HTTP) → Client Updates
```

## Key User Journey Flows

### 1. User Registration and Authentication

#### Registration Flow
```mermaid
sequenceDiagram
    participant UC as Auth Client
    participant AG as API Gateway
    participant US as User Service
    participant ES as Event Streaming
    participant EMS as Email Service
    participant DB as Database

    UC->>AG: POST /auth/register
    AG->>US: POST /users (with tenant context)
    US->>DB: INSERT user record
    US->>ES: Publish UserCreated event
    ES->>EMS: Route EmailVerification event
    EMS->>DB: Log email task
    EMS->>UC: Send verification email
    US->>AG: Return user data
    AG->>UC: 201 Created response
```

**Key Components**:
- **Auth Client**: Collects registration data and handles UI
- **API Gateway**: Validates request, adds tenant context
- **User Service**: Creates user with multi-tenant isolation
- **Event Streaming**: Coordinates verification email
- **Email Service**: Sends welcome/verification emails

**Data Transformations**:
- Registration form data → User record with tenant isolation
- User creation → Email verification event
- Event routing → Email delivery task

#### Authentication Flow
```mermaid
sequenceDiagram
    participant UC as Auth Client
    participant AG as API Gateway
    participant US as User Service
    participant REDIS as Redis Cache
    participant ES as Event Streaming

    UC->>AG: POST /auth/login
    AG->>US: POST /auth/login
    US->>DB: Validate credentials
    US->>US: Generate JWT token
    US->>REDIS: Cache user session
    US->>ES: Publish UserLogin event
    US->>AG: Return JWT token
    AG->>UC: Authentication successful
```

**Security Measures**:
- Password hashing with bcrypt
- JWT token generation with expiration
- Session caching in Redis
- Login event publishing for monitoring

### 2. Multi-Tenant Organization Setup

#### Tenant Creation Flow
```mermaid
sequenceDiagram
    participant AC as Admin Client
    participant AG as API Gateway
    participant TS as Tenant Service
    participant US as User Service
    participant PS as Payment Service
    participant DB as Database

    AC->>AG: POST /tenants
    AG->>TS: Create tenant configuration
    TS->>DB: INSERT tenant record
    TS->>US: Create admin user for tenant
    US->>DB: INSERT user with tenant_id
    TS->>PS: Setup billing configuration
    PS->>DB: Create subscription plan
    TS->>AG: Return tenant data
    AG->>AC: 201 Tenant created
```

**Data Isolation**:
- Tenant record with unique identifier
- User record linked to specific tenant
- Billing configuration scoped to tenant
- Complete data separation at database level

### 3. Payment Processing

#### Subscription Payment Flow
```mermaid
sequenceDiagram
    participant UC as Client
    participant AG as API Gateway
    participant PS as Payment Service
    participant STRIPE as Stripe API
    participant ES as Event Streaming
    participant EMS as Email Service

    UC->>AG: POST /payments/subscribe
    AG->>PS: Process subscription payment
    PS->>STRIPE: Create payment intent
    STRIPE->>PS: Payment intent created
    PS->>STRIPE: Confirm payment
    STRIPE->>PS: Payment successful
    PS->>DB: Update subscription status
    PS->>ES: Publish PaymentProcessed event
    ES->>EMS: Route receipt email
    EMS->>UC: Send payment confirmation
    PS->>AG: Return subscription data
    AG->>UC: Payment successful
```

**Payment Security**:
- PCI-compliant payment processing
- Webhook verification for payment events
- Secure token handling
- Payment event publishing for audit trails

### 4. Real-Time Updates

#### HTTP Platform API and Updates
```mermaid
sequenceDiagram
    participant C as Client Browser
    participant API as Platform API (HTTP)
    participant ES as Event Streaming
    participant S as Business Service

    C->>API: POST /api/query or /api/command
    API->>ES: Publish to event stream
    ES->>S: Route to business service
    S->>ES: Publish response to stream
    ES->>API: Response available
    API->>C: HTTP response (JSON)

    Note over C,API: Request/response over HTTP; no persistent connection
```

**Real-Time Features**:
- HTTP request/response for commands and queries
- Event subscription management via API
- Client-side state synchronization

## Event-Driven Workflows

### Event Sourcing Pattern

#### User Profile Updates
```mermaid
sequenceDiagram
    participant UC as Client
    participant AG as API Gateway
    participant US as User Service
    participant ES as Event Streaming
    participant MS as Monitoring Service

    UC->>AG: PUT /users/profile
    AG->>US: Update user profile
    US->>DB: UPDATE user record
    US->>ES: Publish UserProfileUpdated event
    ES->>MS: Route to monitoring for audit
    US->>AG: Return updated profile
    AG->>UC: 200 Success response

    Note over ES: Event stored for audit trail
    Note over MS: Audit log created
```

**Event Benefits**:
- Complete audit trail of all changes
- Event replay for debugging
- Decoupled event consumers
- Reliable event ordering

### CQRS Pattern Implementation

#### User Query vs Command Operations
```mermaid
sequenceDiagram
    participant C as Client
    participant AG as API Gateway
    participant US as User Service
    participant RQ as Read Query Service
    participant WC as Write Command Service

    C->>AG: GET /users/search
    AG->>RQ: Execute read query
    RQ->>DB: SELECT from read replica
    RQ->>AG: Return query results
    AG->>C: Search results

    C->>AG: POST /users
    AG->>WC: Execute write command
    WC->>DB: INSERT/UPDATE primary database
    WC->>ES: Publish UserCreated event
    WC->>AG: Return created resource
    AG->>C: 201 Created response
```

**CQRS Benefits**:
- Optimized read performance with replicas
- Independent scaling of read/write operations
- Event-driven consistency across read models
- Complex query optimization

### Saga Orchestration

#### Distributed Transaction Example (User + Payment)
```mermaid
sequenceDiagram
    participant S as Saga Coordinator
    participant US as User Service
    participant PS as Payment Service
    participant ES as Event Streaming

    S->>US: CreateUser (Step 1)
    US->>DB: Create user record
    US->>ES: Publish UserCreated
    S->>PS: ProcessPayment (Step 2)
    PS->>DB: Process payment
    PS->>ES: Publish PaymentProcessed
    S->>S: Transaction complete

    Note over S: Compensating actions if any step fails
    Note over ES: Rollback events if needed
```

**Saga Features**:
- Distributed transaction coordination
- Automatic rollback on failures
- Event-driven compensation actions
- Cross-service consistency guarantees

## Background Processing Flows

### Email Delivery Pipeline
```mermaid
sequenceDiagram
    participant ES as Event Streaming
    participant EQ as Email Queue
    participant EMS as Email Service
    participant SG as SendGrid API

    ES->>EQ: Queue EmailSend event
    EQ->>EMS: Process email job
    EMS->>DB: Load email template
    EMS->>DB: Get recipient data
    EMS->>SG: Send email via API
    SG->>EMS: Delivery confirmation
    EMS->>DB: Update delivery status
    EMS->>ES: Publish EmailDelivered event
```

**Queue Processing**:
- Asynchronous email processing
- Retry logic with exponential backoff
- Dead letter queue for failed deliveries
- Delivery tracking and analytics

### Monitoring and Alerting Pipeline
```mermaid
sequenceDiagram
    participant S as All Services
    participant MS as Monitoring Service
    participant ES as Event Streaming
    participant AS as Alert System

    S->>MS: Send metrics/logs
    MS->>MS: Analyze patterns
    MS->>MS: Detect anomalies
    MS->>ES: Publish AlertTriggered
    ES->>AS: Route to alert handlers
    AS->>EMS: Send notification emails
    AS->>DB: Log alert history
```

**Monitoring Flow**:
- Real-time metric collection
- Automated anomaly detection
- Alert routing and escalation
- Notification delivery coordination

## Data Consistency Patterns

### Eventual Consistency via Events
```
1. Service A updates data → Publishes ChangeEvent
2. Event Streaming routes event to interested services
3. Service B consumes event → Updates local read models
4. Service C consumes event → Triggers side effects
5. System reaches eventual consistency
```

### Strong Consistency via Distributed Transactions
```
1. Saga Coordinator starts transaction
2. Multiple services execute local transactions
3. Coordinator monitors completion
4. Success: Commit all changes
5. Failure: Execute compensating actions
```

## Performance Optimization Flows

### Caching Strategy
```mermaid
sequenceDiagram
    participant C as Client
    participant AG as API Gateway
    participant S as Service
    participant REDIS as Redis Cache

    C->>AG: GET /users/profile
    AG->>REDIS: Check cache for user data
    REDIS->>AG: Cache hit - return data
    AG->>C: Return cached response

    Note over REDIS: Cache miss scenario
    AG->>S: Fetch from service
    S->>DB: Query database
    S->>AG: Return fresh data
    AG->>REDIS: Cache result for future requests
    AG->>C: Return response
```

**Caching Benefits**:
- Reduced database load
- Improved response times
- Better user experience
- Configurable TTL per resource type

### CDN and Asset Delivery
```mermaid
sequenceDiagram
    participant C as Client Browser
    participant CDN as CDN Service
    participant S3 as Asset Storage

    C->>CDN: Request static asset
    CDN->>C: Serve from edge location
    Note over CDN: Cache miss scenario
    CDN->>S3: Fetch from origin
    S3->>CDN: Return asset data
    CDN->>C: Serve and cache asset
```

**CDN Benefits**:
- Global asset delivery optimization
- Reduced latency for static content
- Offloaded traffic from origin servers
- Improved scalability

## Error Handling and Resilience Patterns

### Circuit Breaker Pattern
```mermaid
sequenceDiagram
    participant C as Client
    participant AG as API Gateway
    participant S as Service

    C->>AG: Request to service
    AG->>S: Forward request
    S->>AG: Service unavailable (5xx)
    AG->>AG: Increment failure count
    Note over AG: Open circuit after threshold

    C->>AG: Another request
    AG->>C: Fail fast - service unavailable
    Note over AG: Half-open after timeout
    AG->>S: Test request
    S->>AG: Success response
    AG->>AG: Close circuit - normal operation
```

**Resilience Features**:
- Automatic failure detection
- Fast failure for unavailable services
- Gradual recovery testing
- Comprehensive error metrics

### Retry and Backoff Strategy
```mermaid
sequenceDiagram
    participant C as Client
    participant S as Service

    C->>S: Request (attempt 1)
    S->>C: Temporary failure (5xx)
    Note over C: Wait with exponential backoff
    C->>S: Request (attempt 2)
    S->>C: Temporary failure (5xx)
    Note over C: Wait longer with jitter
    C->>S: Request (attempt 3)
    S->>C: Success response
```

**Retry Benefits**:
- Handles transient failures
- Reduces error rates
- Improves system reliability
- Configurable retry policies

## Monitoring and Observability Data Flow

### Distributed Tracing
```mermaid
sequenceDiagram
    participant C as Client
    participant AG as API Gateway
    participant S as Service
    participant T as Tracing System

    C->>AG: Request with trace header
    AG->>T: Start span - gateway processing
    AG->>S: Forward with trace context
    S->>T: Start span - service processing
    S->>DB: Database operation
    S->>T: End span - service complete
    AG->>T: End span - gateway complete
    T->>T: Assemble complete trace
```

**Tracing Benefits**:
- End-to-end request visibility
- Performance bottleneck identification
- Service dependency mapping
- Error correlation across services

This comprehensive data flow documentation provides the foundation for understanding how data moves through the Foment system, enabling effective debugging, optimization, and maintenance of the platform.
