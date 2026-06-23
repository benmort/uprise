# 3. Component Descriptions

This document provides detailed descriptions of each component in the Foment ecosystem, including their responsibilities, technology stacks, and integration patterns.

## Client Applications

### Admin Client (`foment-admin-client`)
**Location**: `/services/clients/admin-client/`
**Technology**: Next.js 14, React, TypeScript
**Port**: 3000

**Purpose**: Comprehensive administrative interface for system management and monitoring.

**Key Responsibilities**:
- User and tenant administration across all organizations
- System-wide analytics and reporting
- Service health monitoring and alerting
- Configuration management for all services
- Audit log viewing and security monitoring

**Key Features**:
- Multi-tenant user management dashboard
- Real-time system metrics and alerts
- Service configuration and deployment management
- Comprehensive audit trails and logging
- Integration with monitoring and alerting systems

**Service Interactions**:
- **Primary**: User Service, Tenant Service, Monitoring Service
- **Secondary**: Email Service (notifications), Payment Service (billing reports)

**Technology Stack**:
- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, Custom component library
- **State Management**: React Context, Custom hooks
- **HTTP Client**: Axios with interceptors
- **Real-time Updates**: Platform API (HTTP) integration
- **Testing**: Jest, React Testing Library, Playwright

---

### Auth Client (`foment-auth-client`)
**Location**: `/services/clients/auth-client/`
**Technology**: Next.js 14, React, TypeScript
**Port**: 3001

**Purpose**: Dedicated authentication and user onboarding interface.

**Key Responsibilities**:
- User registration and account creation
- Multi-factor authentication (MFA/TOTP)
- Password reset and account recovery
- Social login integrations (OAuth2)
- Session management and security

**Key Features**:
- Modern authentication flows with progressive enhancement
- Multi-tenant user registration and isolation
- Comprehensive security measures and validation
- Mobile-responsive design for all devices
- Integration with email verification systems

**Service Interactions**:
- **Primary**: User Service (authentication), Email Service (verification)
- **Secondary**: Tenant Service (multi-tenancy setup)

**Technology Stack**:
- **Frontend**: Next.js 14, React 18, TypeScript
- **Authentication**: JWT, OAuth2, Session management
- **Security**: bcrypt, crypto APIs, secure headers
- **Email Integration**: Email service client library
- **Testing**: Jest, Playwright for E2E testing

---

### Marketing Client (`foment-marketing-client`)
**Location**: `/services/clients/marketing-client/`
**Technology**: Next.js 14, React, TypeScript
**Port**: 3002

**Purpose**: Public-facing marketing website and content management platform.

**Key Responsibilities**:
- Marketing content presentation and management
- Lead generation and capture forms
- SEO optimization and content delivery
- Integration with analytics platforms
- Progressive web app features

**Key Features**:
- Dynamic content management system
- Lead capture with email integration
- SEO-optimized pages and metadata
- Progressive Web App capabilities
- Multi-tenant content isolation

**Service Interactions**:
- **Primary**: Email Service (lead capture), User Service (registration)
- **Secondary**: Payment Service (pricing pages), Tenant Service (demo environments)

**Technology Stack**:
- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS, Custom animations
- **CMS**: Headless CMS integration ready
- **SEO**: Next.js built-in optimization
- **Analytics**: Integration with tracking services

## Core Infrastructure Services

### API Gateway Service
**Location**: `/core-orchestration/apps/api-gateway/`
**Technology**: Next.js 14, TypeScript
**Port**: 8000

**Purpose**: Central entry point for all external API requests with authentication, routing, and rate limiting.

**Key Responsibilities**:
- External client authentication and authorization
- Request routing and load balancing across services
- Rate limiting and DDoS protection
- API versioning and documentation serving
- Request/response transformation and validation

**Key Features**:
- JWT and OAuth2 authentication middleware
- Dynamic request routing based on URL patterns
- Per-client and per-endpoint rate limiting
- Comprehensive request logging and tracing
- API documentation auto-generation

**Technology Stack**:
- **Runtime**: Next.js 14 with API Routes
- **Authentication**: JWT, OAuth2, API keys
- **Rate Limiting**: Custom middleware with Redis
- **Monitoring**: Distributed tracing integration
- **Documentation**: Swagger/OpenAPI integration

---

### Event Streaming Service
**Location**: `/core-orchestration/apps/event-streaming-service/`
**Technology**: Next.js 14, TypeScript, Rust (performance-critical components)
**Port**: 8001

**Purpose**: Central event bus providing real-time communication and event sourcing capabilities.

**Key Responsibilities**:
- Event publishing and consumption via REST APIs
- HTTP Platform API for client requests and responses
- Server-Sent Events for efficient one-way communication
- Event store management with Redis persistence
- Event replay and recovery mechanisms

**Key Features**:
- High-throughput event processing
- Persistent event storage with Redis
- HTTP request/response for client commands and queries
- Event schema validation and versioning
- Event replay for debugging and recovery

**Technology Stack**:
- **Runtime**: Next.js 14 with HTTP API
- **Event Store**: Redis with persistence
- **Client communication**: HTTP Platform API, Server-Sent Events
- **Performance**: Rust for CPU-intensive operations
- **Monitoring**: Event throughput and latency tracking

## Business Services

### User Service (`foment-user-service`)
**Location**: `/services/user-service/`
**Technology**: Next.js 14, TypeScript, PostgreSQL
**Port**: 3007

**Purpose**: Comprehensive user management and authentication across multi-tenant environments.

**Key Responsibilities**:
- User CRUD operations with multi-tenant isolation
- Authentication and authorization logic
- User profile and preference management
- Password hashing and security validation
- User activity tracking and analytics

**Key Features**:
- Multi-tenant user data isolation
- Advanced authentication patterns (MFA, magic links)
- User activity and security event logging
- Integration with email verification systems
- Comprehensive audit trails

**Service Interactions**:
- **Publishes Events**: UserCreated, UserUpdated, UserDeleted, AuthenticationEvents
- **Consumes Events**: EmailSent, PaymentProcessed, TenantUpdates

**Technology Stack**:
- **Runtime**: Next.js 14 API Routes
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: bcrypt, JWT, TOTP
- **Event Integration**: Event-based service client
- **Testing**: Jest, PostgreSQL testing

---

### Tenant Service (`foment-tenant-service`)
**Location**: `/services/tenant-service/`
**Technology**: Next.js 14, TypeScript, PostgreSQL
**Port**: 3006

**Purpose**: Multi-tenancy management and tenant lifecycle orchestration.

**Key Responsibilities**:
- Tenant creation, configuration, and lifecycle management
- Multi-tenant data isolation and access control
- Tenant-specific configuration and customization
- Cross-tenant analytics and reporting
- Tenant billing and subscription coordination

**Key Features**:
- Complete tenant data isolation at database level
- Tenant-specific configuration management
- Automated tenant provisioning and setup
- Cross-tenant usage analytics
- Integration with payment systems for billing

**Service Interactions**:
- **Publishes Events**: TenantCreated, TenantUpdated, TenantDeleted, BillingEvents
- **Consumes Events**: UserCreated, PaymentProcessed

**Technology Stack**:
- **Runtime**: Next.js 14 API Routes
- **Database**: PostgreSQL with tenant isolation
- **Configuration**: Environment-based configuration
- **Event Integration**: Event-driven patterns
- **Security**: Row-level security for tenant isolation

---

### Payment Service (`foment-payment-service`)
**Location**: `/services/payment-service/`
**Technology**: Next.js 14, TypeScript, PostgreSQL
**Port**: 3005

**Purpose**: Payment processing, billing, and subscription management across tenants.

**Key Responsibilities**:
- Payment processing and gateway integration
- Subscription lifecycle management
- Invoice generation and delivery
- Payment analytics and reporting
- Billing coordination across tenants

**Key Features**:
- Multiple payment gateway support (Stripe, etc.)
- Automated subscription management
- Comprehensive billing and invoicing
- Payment failure handling and dunning management
- Multi-tenant billing coordination

**Service Interactions**:
- **Publishes Events**: PaymentProcessed, PaymentFailed, SubscriptionCreated, InvoiceGenerated
- **Consumes Events**: UserCreated, TenantCreated

**Technology Stack**:
- **Runtime**: Next.js 14 API Routes
- **Database**: PostgreSQL with financial data isolation
- **Payment Processing**: Stripe SDK integration
- **Event Integration**: Event-based coordination
- **Security**: PCI-compliant payment handling

---

### Email Service (`foment-email-service`)
**Location**: `/services/email-service/`
**Technology**: Next.js 14, TypeScript, PostgreSQL, Rust
**Port**: 3003

**Purpose**: Email delivery, template management, and communication tracking.

**Key Responsibilities**:
- Email template creation and management
- Email delivery orchestration and tracking
- Communication analytics and reporting
- Integration with email delivery providers
- Multi-channel notification support

**Key Features**:
- Drag-and-drop email template builder
- Comprehensive email delivery tracking
- A/B testing for email campaigns
- Integration with SMS and push notifications
- Email analytics and engagement metrics

**Service Interactions**:
- **Publishes Events**: EmailSent, EmailDelivered, EmailFailed, EmailOpened
- **Consumes Events**: UserCreated, PaymentProcessed, TenantUpdates

**Technology Stack**:
- **Runtime**: Next.js 14 API Routes
- **Database**: PostgreSQL for email tracking
- **Email Delivery**: SendGrid API integration
- **Performance**: Rust for email processing
- **Templates**: Handlebars/MJML template engine

---

### Monitoring Service (`foment-monitoring-service`)
**Location**: `/services/monitoring-service/`
**Technology**: Next.js 14, TypeScript, PostgreSQL
**Port**: 3004

**Purpose**: Centralized logging, metrics collection, and system observability.

**Key Responsibilities**:
- Log aggregation and analysis across all services
- Metrics collection and processing
- Health monitoring and alerting
- Distributed tracing coordination
- Performance monitoring and optimization

**Key Features**:
- Centralized log aggregation with search
- Real-time metrics dashboard
- Automated alerting and notification system
- Distributed tracing across service boundaries
- Performance bottleneck identification

**Service Interactions**:
- **Consumes Events**: All service events for logging and monitoring
- **Publishes Events**: AlertTriggered, HealthCheckFailed, MetricUpdates

**Technology Stack**:
- **Runtime**: Next.js 14 API Routes
- **Database**: PostgreSQL for log storage
- **Log Processing**: Structured logging pipeline
- **Metrics**: Prometheus-compatible metrics
- **Alerting**: Custom alerting engine

## Shared Infrastructure Packages

### Environment Configuration (`@foment/environment-configuration`)
**Location**: `/packages/environment-configuration/`

**Purpose**: Centralized configuration management across all services and environments.

**Key Features**:
- Environment-specific configuration loading
- Configuration validation and type safety
- Secrets management integration
- Environment variable templating
- Configuration hot-reloading support

**Technology Stack**:
- TypeScript with strict typing
- Environment-based configuration
- Validation with Zod or Joi
- Integration with Docker/Kubernetes

---

### Event-Based Service Client (`@foment/event-based-service-client`)
**Location**: `/packages/event-based-service-client/`

**Purpose**: Standardized client library for service-to-service communication using events.

**Key Features**:
- Type-safe event publishing and consumption
- Event schema validation
- Retry and error handling mechanisms
- Event versioning support
- Integration with monitoring systems

**Technology Stack**:
- TypeScript with comprehensive type definitions
- Event schema definitions
- Retry logic with exponential backoff
- Integration with logging systems

---

### Shared Infrastructure (`@foment/shared-infrastructure`)
**Location**: `/packages/shared-infrastructure/`

**Purpose**: Common utilities, types, and infrastructure components shared across all services.

**Key Features**:
- Common TypeScript types and interfaces
- Shared utility functions
- Database connection management
- Authentication middleware
- Error handling patterns

**Technology Stack**:
- TypeScript utility types
- Shared constants and enums
- Database abstraction layers
- Common validation patterns

## External Dependencies

### Database Infrastructure
**PostgreSQL**
- Primary data storage for all services
- Multi-tenant architecture with row-level security
- Connection pooling and read replicas
- Automated backup and recovery

**Redis**
- Caching layer for improved performance
- Session storage for authentication
- Event store for Event Streaming service
- Distributed locking for coordination

### External Service Providers
**SendGrid**
- Email delivery infrastructure
- Template management and analytics
- Bounce and delivery tracking
- SMTP API integration

**Stripe**
- Payment processing infrastructure
- Subscription management APIs
- Webhook event handling
- Compliance and security features

**SMS Providers**
- Multi-channel notification delivery
- Phone number validation
- Delivery tracking and analytics
- International SMS support

## Development and Deployment Tools

### Docker & Containerization
- All services containerized for consistency
- Docker Compose for local development
- Multi-stage builds for optimized images
- Health checks and dependency management

### Kubernetes (Production)
- Production orchestration and scaling
- Service mesh integration (Istio/Linkerd)
- Ingress management and load balancing
- Secrets management and configuration

### CI/CD Pipeline
- GitHub Actions for automated workflows
- Multi-environment deployment strategy
- Automated testing and quality gates
- Rollback capabilities and blue-green deployments

This comprehensive component inventory provides the foundation for understanding how each piece fits into the overall Foment architecture and enables effective development, deployment, and maintenance of the system.
