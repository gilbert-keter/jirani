# Jirani - Service Marketplace Platform

## Comprehensive Technical Architecture & Implementation Guide

---

## EXECUTIVE SUMMARY

Jirani is an enterprise-grade service marketplace platform connecting service providers with customers, featuring secure escrow payments, advanced booking systems, and comprehensive trust mechanisms.

**Key Metrics Target:**

- Support: 1M+ concurrent users
- Response Time: <200ms API responses
- Uptime: 99.9% SLA
- Payment Processing: PCI DSS compliant
- Security: SOC 2 Type II compliant

---

## 1. TECHNOLOGY STACK EVALUATION

### 1.1 Backend: Directus vs Custom API

#### ❌ **DIRECTUS - NOT RECOMMENDED FOR THIS USE CASE**

**Why Directus Falls Short:**

1. **Complex Business Logic Limitations**
   - Directus is a headless CMS, excellent for content management
   - Your app requires complex transactional logic (escrow, payments, disputes)
   - Directus flows/hooks become unmaintainable at this complexity level
   - Custom API endpoints in Directus defeat its purpose

2. **Escrow & Payment Processing**
   - Real-time payment orchestration needs custom logic
   - Multi-step escrow workflows don't fit CMS patterns
   - PCI compliance requires fine-grained control
   - Payment gateway webhooks need sophisticated handling

3. **Performance at Scale**
   - Directus adds overhead for data modeling
   - Custom caching strategies harder to implement
   - Query optimization limited by abstraction layer
   - Real-time features (notifications, availability) need WebSocket control

4. **Transaction Management**
   - Complex multi-table transactions (booking + payment + escrow)
   - ACID compliance critical for financial operations
   - Directus transaction support limited for custom logic

#### ✅ **RECOMMENDED STACK**

**Backend Framework:**

```
Node.js + TypeScript + Express (or NestJS for better architecture)
```

**Why:**

- Full control over business logic
- Excellent async handling for real-time features
- Vast ecosystem for payments, notifications, etc.
- TypeScript ensures type safety across full stack
- NestJS provides dependency injection, better testing

**Alternative (if you prefer):**

```
Go (Fiber/Gin) - Better performance, compiled
Python (FastAPI) - ML integration, rapid development
```

### 1.2 Frontend Stack ✅ **APPROVED**

```typescript
React Router 7 + TypeScript + Tailwind CSS + Vite
```

**Additional Recommendations:**

- **State Management:** Zustand or Redux Toolkit
- **API Client:** TanStack Query (React Query) for caching
- **Forms:** React Hook Form + Zod validation
- **UI Components:** Shadcn/ui (Tailwind-based, tree-shakeable)
- **Real-time:** Socket.io client for live updates

### 1.3 Infrastructure Stack ✅ **APPROVED**

```
Docker + Docker Compose + NGINX + Load Balancer
```

**Production Additions:**

- **Orchestration:** Kubernetes (K8s) for production scaling
- **CDN:** CloudFlare for static assets
- **Load Balancer:** AWS ALB, GCP Load Balancer, or HAProxy
- **Auto-scaling:** Horizontal Pod Autoscaler (HPA)

---

## 2. DATABASE ARCHITECTURE

### 2.1 Primary Database: PostgreSQL

**Why PostgreSQL:**

- ACID transactions (critical for payments)
- JSON support for flexible data
- Excellent performance at scale
- PostGIS for location-based search
- Full-text search capabilities

### 2.2 Schema Design (Key Tables)

```sql
-- Users & Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('customer', 'provider', 'both', 'admin')),
    kyc_status VARCHAR(20) DEFAULT 'pending',
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    location GEOGRAPHY(POINT),
    address JSONB,
    language_preferences JSONB,
    notification_settings JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Services
CREATE TABLE service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    parent_id UUID REFERENCES service_categories(id),
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES service_categories(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    pricing_type VARCHAR(20) CHECK (pricing_type IN ('fixed', 'hourly', 'custom')),
    base_price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'KES',
    duration_minutes INTEGER,
    location_type VARCHAR(20) CHECK (location_type IN ('remote', 'on-site', 'hybrid')),
    service_area GEOGRAPHY(POLYGON), -- For on-site services
    max_distance_km INTEGER,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB, -- Flexible data: requirements, FAQs, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE service_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    media_type VARCHAR(20) CHECK (media_type IN ('image', 'video', 'document')),
    url TEXT NOT NULL,
    display_order INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Availability Management
CREATE TABLE availability_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_recurring BOOLEAN DEFAULT true,
    specific_date DATE, -- For one-time availability
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE availability_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_number VARCHAR(20) UNIQUE NOT NULL, -- e.g., BK-20250208-1234
    customer_id UUID REFERENCES users(id),
    provider_id UUID REFERENCES users(id),
    service_id UUID REFERENCES services(id),
    status VARCHAR(30) CHECK (status IN (
        'pending', 'accepted', 'rejected', 'in_progress',
        'completed', 'cancelled', 'disputed', 'refunded'
    )),
    scheduled_start TIMESTAMP NOT NULL,
    scheduled_end TIMESTAMP,
    actual_start TIMESTAMP,
    actual_end TIMESTAMP,
    location JSONB, -- Address or coordinates
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KES',
    customer_notes TEXT,
    provider_notes TEXT,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_provider ON bookings(provider_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_scheduled ON bookings(scheduled_start);

-- Payment & Escrow System
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(50) UNIQUE NOT NULL, -- External ref
    booking_id UUID REFERENCES bookings(id),
    user_id UUID REFERENCES users(id),
    type VARCHAR(30) CHECK (type IN (
        'payment', 'refund', 'payout', 'fee', 'adjustment'
    )),
    status VARCHAR(20) CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KES',
    payment_method VARCHAR(30), -- stripe, mpesa, paypal
    payment_gateway_ref VARCHAR(255),
    metadata JSONB, -- Gateway response data
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE escrow_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) UNIQUE,
    transaction_id UUID REFERENCES transactions(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'KES',
    status VARCHAR(20) CHECK (status IN (
        'held', 'released', 'refunded', 'disputed'
    )),
    held_at TIMESTAMP DEFAULT NOW(),
    release_scheduled_at TIMESTAMP, -- Auto-release date
    released_at TIMESTAMP,
    released_to UUID REFERENCES users(id),
    platform_fee DECIMAL(10, 2),
    fee_percentage DECIMAL(5, 2) DEFAULT 15.00,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_escrow_booking ON escrow_accounts(booking_id);
CREATE INDEX idx_escrow_status ON escrow_accounts(status);

-- Ratings & Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) UNIQUE,
    reviewer_id UUID REFERENCES users(id), -- Customer or Provider
    reviewee_id UUID REFERENCES users(id), -- Provider or Customer
    rating INTEGER CHECK (rating BETWEEN 1 AND 5) NOT NULL,
    review_text TEXT,
    review_type VARCHAR(20) CHECK (review_type IN ('provider_review', 'customer_review')),
    is_public BOOLEAN DEFAULT true,
    moderation_status VARCHAR(20) DEFAULT 'pending',
    moderated_at TIMESTAMP,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE review_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    responder_id UUID REFERENCES users(id),
    response_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE provider_stats (
    provider_id UUID PRIMARY KEY REFERENCES users(id),
    total_jobs INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    cancelled_jobs INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    total_reviews INTEGER DEFAULT 0,
    response_rate DECIMAL(5, 2) DEFAULT 0.00, -- Percentage
    average_response_time INTEGER, -- Minutes
    on_time_completion_rate DECIMAL(5, 2) DEFAULT 0.00,
    total_earnings DECIMAL(12, 2) DEFAULT 0.00,
    badges JSONB, -- Array of earned badges
    last_calculated_at TIMESTAMP DEFAULT NOW()
);

-- Disputes
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_number VARCHAR(20) UNIQUE NOT NULL,
    booking_id UUID REFERENCES bookings(id),
    initiated_by UUID REFERENCES users(id),
    dispute_type VARCHAR(30) CHECK (dispute_type IN (
        'service_not_delivered', 'quality_issue', 'payment_issue',
        'behaviour_issue', 'other'
    )),
    status VARCHAR(20) CHECK (status IN (
        'open', 'under_review', 'resolved', 'closed', 'escalated'
    )),
    description TEXT NOT NULL,
    resolution VARCHAR(30),
    resolution_details TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dispute_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    message TEXT NOT NULL,
    attachments JSONB,
    is_admin_message BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- booking_request, payment_received, etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- Context data
    channel VARCHAR(20), -- push, email, sms, in_app
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

-- Verification & KYC
CREATE TABLE kyc_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) UNIQUE,
    verification_type VARCHAR(30), -- identity, address, phone, email
    status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    document_type VARCHAR(50), -- passport, national_id, drivers_license
    document_number VARCHAR(100),
    document_url TEXT,
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id),
    rejection_reason TEXT,
    expiry_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Search & Analytics
CREATE TABLE search_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    search_query TEXT,
    filters JSONB,
    results_count INTEGER,
    clicked_service_id UUID REFERENCES services(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.3 Caching Layer: Redis

**Redis Use Cases:**

1. **Session Management** - Store JWT refresh tokens
2. **Rate Limiting** - API rate limiting per user/IP
3. **Real-time Data** - Available providers, active bookings
4. **Cache Layer** - Frequently accessed data (categories, featured providers)
5. **Pub/Sub** - Real-time notifications
6. **Queue** - Background job queues (Bull/BullMQ)

**Redis Data Structures:**

```javascript
// Session storage
session:{userId}:{sessionId} -> JWT data (TTL: 24h)

// Rate limiting
ratelimit:{userId}:api -> count (TTL: 1 minute)

// Provider availability cache
availability:{providerId}:{date} -> time slots JSON

// Active booking cache
booking:{bookingId}:status -> status object

// Search results cache
search:{query_hash} -> results JSON (TTL: 5 minutes)
```

### 2.4 Search Engine: Elasticsearch

**Why Elasticsearch:**

- Full-text search across services
- Geospatial queries (find providers near me)
- Faceted search (filters)
- Real-time indexing
- Highly scalable

**Index Structure:**

```json
{
  "services": {
    "mappings": {
      "properties": {
        "id": { "type": "keyword" },
        "title": { "type": "text", "analyzer": "standard" },
        "description": { "type": "text" },
        "category": { "type": "keyword" },
        "provider_id": { "type": "keyword" },
        "provider_name": { "type": "text" },
        "provider_rating": { "type": "float" },
        "location": { "type": "geo_point" },
        "price": { "type": "float" },
        "currency": { "type": "keyword" },
        "is_active": { "type": "boolean" },
        "tags": { "type": "keyword" },
        "created_at": { "type": "date" }
      }
    }
  }
}
```

---

## 3. API ARCHITECTURE

### 3.1 RESTful API Design

**Base URL:** `https://api.jirani.com/v1`

**Key Endpoints:**

```
Authentication & Users
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/verify-email
POST   /auth/verify-phone
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /users/me
PATCH  /users/me
GET    /users/:id/profile
POST   /users/me/kyc

Services
GET    /services
GET    /services/:id
POST   /services (provider only)
PATCH  /services/:id
DELETE /services/:id
GET    /services/:id/availability
GET    /categories

Search & Discovery
GET    /search
POST   /search/advanced
GET    /recommendations
GET    /featured-providers
GET    /nearby-providers

Bookings
GET    /bookings
GET    /bookings/:id
POST   /bookings
PATCH  /bookings/:id/accept
PATCH  /bookings/:id/reject
PATCH  /bookings/:id/cancel
PATCH  /bookings/:id/complete
PATCH  /bookings/:id/start
GET    /bookings/:id/timeline

Payments & Escrow
POST   /payments/authorize
POST   /payments/webhooks/:provider (Stripe, M-Pesa)
GET    /escrow/:bookingId
POST   /escrow/:bookingId/release
POST   /escrow/:bookingId/refund

Reviews & Ratings
GET    /reviews
POST   /reviews
GET    /reviews/:id
POST   /reviews/:id/helpful
POST   /reviews/:id/respond

Disputes
GET    /disputes
POST   /disputes
GET    /disputes/:id
POST   /disputes/:id/messages
PATCH  /disputes/:id/resolve

Notifications
GET    /notifications
PATCH  /notifications/:id/read
PATCH  /notifications/read-all
GET    /notifications/preferences
PATCH  /notifications/preferences

Availability
GET    /availability/:providerId
POST   /availability
PATCH  /availability/:id
DELETE /availability/:id
POST   /availability/exceptions

Analytics (Provider)
GET    /analytics/dashboard
GET    /analytics/earnings
GET    /analytics/bookings

Admin
GET    /admin/users
GET    /admin/services
GET    /admin/bookings
GET    /admin/disputes
GET    /admin/analytics
POST   /admin/users/:id/verify
POST   /admin/services/:id/approve
```

### 3.2 API Response Format

**Success Response:**

```json
{
  "success": true,
  "data": {
    // Response payload
  },
  "meta": {
    "timestamp": "2025-02-08T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "error": {
    "code": "BOOKING_NOT_FOUND",
    "message": "The requested booking does not exist",
    "details": {
      "booking_id": "123"
    }
  },
  "meta": {
    "timestamp": "2025-02-08T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

**Pagination:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

### 3.3 Authentication & Authorization

**JWT-based Authentication:**

```typescript
// Access Token (short-lived: 15 minutes)
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "provider",
  "iat": 1234567890,
  "exp": 1234568790
}

// Refresh Token (long-lived: 7 days, stored in Redis)
{
  "sub": "user_id",
  "type": "refresh",
  "session_id": "sess_xyz",
  "iat": 1234567890,
  "exp": 1235172690
}
```

**Authorization Middleware:**

```typescript
// Protect routes
app.get('/bookings', authenticate, getBookings)

// Role-based access
app.post(
  '/services',
  authenticate,
  requireRole(['provider', 'both']),
  createService,
)

// Resource ownership check
app.patch('/services/:id', authenticate, checkServiceOwnership, updateService)
```

### 3.4 Rate Limiting

**Strategy:**

```typescript
// Rate limits by endpoint
const rateLimits = {
  '/auth/login': { window: '15m', max: 5 },
  '/auth/register': { window: '1h', max: 3 },
  '/search': { window: '1m', max: 30 },
  '/bookings': { window: '1h', max: 100 },
  default: { window: '15m', max: 100 },
}

// Redis-based implementation
import rateLimit from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'

const limiter = rateLimit({
  store: new RedisStore({ client: redisClient }),
  windowMs: 15 * 60 * 1000,
  max: 100,
})
```

---

## 4. CRITICAL BUSINESS FLOWS

### 4.1 Complete Booking Flow

```
1. Customer searches for service
   → Elasticsearch query with filters (location, price, rating, availability)
   → Return sorted results with provider info

2. Customer views service details
   → GET /services/:id
   → Load provider profile, reviews, availability
   → Display real-time availability slots

3. Customer selects time slot
   → Check availability in real-time (Redis + PostgreSQL)
   → Prevent double-booking with optimistic locking

4. Customer initiates booking
   → POST /bookings
   → Create booking record (status: pending)
   → Reserve time slot (soft lock for 10 minutes)

5. Payment authorization
   → POST /payments/authorize
   → Charge customer via payment gateway
   → Store payment intent reference

6. Notify provider
   → Create notification record
   → Send push + email + SMS (based on preferences)
   → Provider has 24 hours to respond (configurable)

7. Provider accepts/rejects
   → PATCH /bookings/:id/accept or /reject
   → If accept:
     - Complete payment capture
     - Move funds to escrow
     - Confirm time slot reservation
     - Notify customer
   → If reject:
     - Refund payment authorization
     - Release time slot
     - Suggest alternative providers
     - Notify customer

8. Service delivery period
   → Provider marks service started (optional)
   → Real-time status updates
   → In-app messaging between customer and provider

9. Service completion
   → Provider marks as complete
   → Customer confirms completion
   → If no confirmation within 7 days (configurable):
     - Auto-complete booking
     - Trigger escrow release

10. Escrow release
    → Deduct platform fee (15% default)
    → Transfer to provider account
    → Generate invoice
    → Update provider stats

11. Review & rating
    → Prompt customer to review
    → Prompt provider to review customer (optional)
    → Update ratings in real-time
    → Trigger badge calculations
```

### 4.2 Escrow Management Flow

```typescript
// Escrow lifecycle
interface EscrowFlow {
  1. Payment Captured → Create Escrow Record
     - booking_id: ref
     - amount: total
     - status: 'held'
     - held_at: timestamp
     - release_scheduled_at: held_at + 7 days

  2. Auto-Release Check (Background Job - runs hourly)
     - Find escrows where release_scheduled_at < NOW()
     - Check booking status === 'completed'
     - If no disputes, release funds

  3. Manual Release (Customer confirms)
     - PATCH /escrow/:bookingId/release
     - Validate customer is requester
     - Calculate platform fee
     - Initiate payout to provider

  4. Refund (Cancellation/Dispute)
     - Check cancellation policy
     - Calculate refund amount
     - Return to customer
     - Update escrow status: 'refunded'

  5. Dispute Hold
     - If dispute opened, flag escrow
     - Freeze auto-release
     - Wait for resolution
     - Release based on dispute outcome
}
```

### 4.3 Dispute Resolution Flow

```
1. Dispute Initiated
   → POST /disputes
   → Freeze escrow funds
   → Notify both parties
   → Set timeline (e.g., 7 days for evidence)

2. Evidence Collection
   → Both parties upload evidence
   → Chat thread for communication
   → Admin can request additional info

3. Admin Review
   → Assign to dispute resolution team
   → Review all evidence
   → Check booking history, ratings
   → May request external verification

4. Resolution Decision
   Options:
   a) Full refund to customer
      - Cancel booking
      - Refund 100% + platform fee
      - Flag provider if repeated issues

   b) Release to provider
      - Complete booking
      - Release full amount minus platform fee
      - Flag customer if fraudulent claim

   c) Partial refund
      - Split amount (e.g., 50/50)
      - Mark booking as partially completed
      - Update both parties' ratings

   d) Escalate
      - Complex cases
      - Legal review required

5. Post-Resolution
   → Update both parties
   → Apply any penalties/restrictions
   → Learn from case for future improvements
   → Add to dispute analytics
```

### 4.4 Payment Gateway Integration

**Supported Gateways:**

1. **Stripe** (International cards, Apple Pay, Google Pay)
2. **M-Pesa** (Kenya mobile money - critical for local market)
3. **PayPal** (International)
4. **Flutterwave** (Africa focus)

**Payment Flow:**

```typescript
// Generic payment interface
interface PaymentGateway {
  authorize(amount, currency, metadata): PaymentIntent
  capture(paymentIntentId): Transaction
  refund(transactionId, amount): Refund
  handleWebhook(payload, signature): WebhookEvent
}

// M-Pesa specific (critical for Kenya)
class MpesaGateway implements PaymentGateway {
  // STK Push (customer initiates)
  async authorize(phone, amount) {
    // Trigger M-Pesa prompt on customer's phone
    const response = await mpesaClient.stkPush({
      phoneNumber: phone,
      amount: amount,
      accountReference: `BOOKING-${bookingId}`,
      transactionDesc: 'Jirani Service Payment',
    })

    // Store callback URL for webhook
    return { paymentIntentId: response.CheckoutRequestID }
  }

  // Webhook handler
  async handleWebhook(payload) {
    // Verify callback signature
    // Update transaction status
    // If successful → proceed to escrow
    // If failed → notify customer, release slot
  }
}
```

### 4.5 Notification System

**Multi-Channel Strategy:**

```typescript
interface NotificationService {
  channels: ['push', 'email', 'sms', 'in_app'];

  async send(userId, type, data) {
    // Get user preferences
    const prefs = await getUserNotificationPrefs(userId);

    // Determine channels based on urgency & preference
    const channels = this.selectChannels(type, prefs);

    // Queue notifications
    for (const channel of channels) {
      await notificationQueue.add({
        userId,
        channel,
        type,
        data,
        template: this.getTemplate(type, channel)
      });
    }
  }
}

// Notification types and their channel priorities
const notificationRules = {
  'booking_request': ['push', 'email', 'sms'], // High urgency
  'payment_received': ['push', 'email'], // Medium urgency
  'review_received': ['push', 'in_app'], // Low urgency
  'dispute_update': ['push', 'email', 'sms'], // High urgency
  'booking_reminder': ['push', 'sms'], // Medium urgency (24h before)
};
```

---

## 5. SECURITY IMPLEMENTATION

### 5.1 Security Layers

```typescript
// 1. Input Validation & Sanitization
import { body, param, query, validationResult } from 'express-validator'
import DOMPurify from 'isomorphic-dompurify'

app.post(
  '/bookings',
  [
    body('service_id').isUUID(),
    body('scheduled_start').isISO8601(),
    body('amount')
      .isDecimal()
      .custom((val) => val > 0),
    body('notes').optional().customSanitizer(DOMPurify.sanitize),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    // Process booking
  },
)

// 2. SQL Injection Prevention (Parameterized Queries)
// Always use query builders or ORM
const booking = await db.query(
  'SELECT * FROM bookings WHERE id = $1 AND customer_id = $2',
  [bookingId, userId],
)

// 3. XSS Prevention
// - Sanitize all user input before storage
// - Use Content Security Policy headers
// - Escape output in templates

// 4. CSRF Protection
import csrf from 'csurf'
app.use(csrf({ cookie: true }))

// 5. Rate Limiting (Already covered)

// 6. HTTPS Only
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect('https://' + req.headers.host + req.url)
  }
  next()
})

// 7. Security Headers
import helmet from 'helmet'
app.use(helmet())
```

### 5.2 Data Encryption

```typescript
// Encryption at rest (PostgreSQL)
// Use transparent data encryption (TDE) or column-level encryption

// Sensitive data encryption
import crypto from 'crypto'

class EncryptionService {
  private algorithm = 'aes-256-gcm'
  private key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')

  encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const tag = cipher.getAuthTag()

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    }
  }

  decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, 'hex'),
    )

    decipher.setAuthTag(Buffer.from(tag, 'hex'))

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }
}

// Use for: payment details, KYC documents, personal identification numbers
```

### 5.3 PCI DSS Compliance

**Critical Rules:**

1. **Never store full card numbers** - Use tokenization (Stripe, PayPal)
2. **Never store CVV/CVC** - Ever
3. **Encrypted transmission** - Always HTTPS
4. **Limited access** - Role-based access to payment data
5. **Audit logging** - Log all payment-related actions
6. **Regular scanning** - Vulnerability scans
7. **Strong passwords** - Enforce password policies

**Implementation:**

```typescript
// Use payment gateway tokenization
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000,
  currency: 'kes',
  payment_method_types: ['card'],
  // Stripe handles card storage, we only store payment_intent_id
})

// Store only safe data
await db.transactions.create({
  booking_id: bookingId,
  amount: 5000,
  payment_gateway: 'stripe',
  payment_intent_id: paymentIntent.id, // Token, not card number
  last4: '4242', // Only last 4 digits
  brand: 'visa',
})
```

### 5.4 Fraud Detection

```typescript
// Basic fraud detection rules
interface FraudCheck {
  // 1. Velocity checks
  async checkBookingVelocity(userId: string): Promise<boolean> {
    const recentBookings = await countBookingsLast24Hours(userId);
    return recentBookings < 10; // Max 10 bookings/day
  }

  // 2. Amount anomaly detection
  async checkAmountAnomaly(userId: string, amount: number): Promise<boolean> {
    const avgAmount = await getAverageBookingAmount(userId);
    return amount < avgAmount * 3; // Flag if 3x higher than average
  }

  // 3. Geolocation check
  async checkGeolocation(userId: string, ip: string): Promise<boolean> {
    const userLocation = await getUserLocation(userId);
    const ipLocation = await getIpLocation(ip);
    return calculateDistance(userLocation, ipLocation) < 500; // km
  }

  // 4. Device fingerprinting
  async checkDevice(userId: string, fingerprint: string): Promise<boolean> {
    const knownDevices = await getUserDevices(userId);
    return knownDevices.includes(fingerprint) || knownDevices.length < 5;
  }

  // 5. Pattern recognition
  async checkSuspiciousPattern(userId: string): Promise<FraudScore> {
    // ML model integration (future enhancement)
    const features = await extractUserFeatures(userId);
    const score = await fraudMLModel.predict(features);
    return score;
  }
}
```

---

## 6. FRONTEND ARCHITECTURE

### 6.1 Project Structure

```
jirani-web/
├── public/
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── app/
│   │   ├── routes/          # React Router 7 routes
│   │   │   ├── _index.tsx   # Homepage
│   │   │   ├── auth/
│   │   │   │   ├── login.tsx
│   │   │   │   └── register.tsx
│   │   │   ├── services/
│   │   │   │   ├── $id.tsx  # Service details
│   │   │   │   └── create.tsx
│   │   │   ├── bookings/
│   │   │   │   ├── _index.tsx
│   │   │   │   └── $id.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── provider.tsx
│   │   │   │   └── customer.tsx
│   │   │   └── profile/
│   │   │       └── $id.tsx
│   │   └── root.tsx
│   ├── components/
│   │   ├── ui/              # Shadcn components
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── booking/
│   │   │   ├── BookingCard.tsx
│   │   │   ├── BookingForm.tsx
│   │   │   └── AvailabilityCalendar.tsx
│   │   ├── service/
│   │   │   ├── ServiceCard.tsx
│   │   │   ├── ServiceGrid.tsx
│   │   │   └── ServiceFilters.tsx
│   │   └── payment/
│   │       ├── PaymentForm.tsx
│   │       └── EscrowStatus.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts    # Axios instance
│   │   │   ├── auth.ts
│   │   │   ├── bookings.ts
│   │   │   ├── services.ts
│   │   │   └── payments.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useBookings.ts
│   │   │   └── useNotifications.ts
│   │   ├── store/           # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── bookingStore.ts
│   │   │   └── notificationStore.ts
│   │   ├── utils/
│   │   │   ├── formatters.ts
│   │   │   ├── validators.ts
│   │   │   └── constants.ts
│   │   └── socket.ts        # Socket.io client
│   ├── types/
│   │   ├── api.ts
│   │   ├── models.ts
│   │   └── forms.ts
│   └── styles/
│       └── globals.css
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

### 6.2 Key Frontend Features

**1. Real-time Updates with Socket.io**

```typescript
// lib/socket.ts
import { io, Socket } from 'socket.io-client'

class SocketService {
  private socket: Socket | null = null

  connect(userId: string) {
    this.socket = io(process.env.VITE_WS_URL, {
      auth: { token: localStorage.getItem('access_token') },
    })

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket')
      this.socket?.emit('join', `user:${userId}`)
    })

    // Listen for events
    this.socket.on('booking:new', (data) => {
      // Update UI with new booking
      useBookingStore.getState().addBooking(data)
      toast.success('New booking request!')
    })

    this.socket.on('payment:received', (data) => {
      // Update escrow status
      useBookingStore.getState().updatePaymentStatus(data)
    })
  }

  disconnect() {
    this.socket?.disconnect()
  }
}

export const socketService = new SocketService()
```

**2. Optimistic UI Updates**

```typescript
// hooks/useBookings.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useAcceptBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (bookingId: string) => api.bookings.accept(bookingId),

    // Optimistic update
    onMutate: async (bookingId) => {
      await queryClient.cancelQueries(['bookings'])

      const previous = queryClient.getQueryData(['bookings'])

      queryClient.setQueryData(['bookings'], (old: any) => ({
        ...old,
        data: old.data.map((b: any) =>
          b.id === bookingId ? { ...b, status: 'accepted' } : b,
        ),
      }))

      return { previous }
    },

    // Rollback on error
    onError: (err, variables, context) => {
      queryClient.setQueryData(['bookings'], context?.previous)
      toast.error('Failed to accept booking')
    },

    // Refetch on success
    onSuccess: () => {
      queryClient.invalidateQueries(['bookings'])
      toast.success('Booking accepted!')
    },
  })
}
```

**3. Progressive Web App (PWA)**

```json
// public/manifest.json
{
  "name": "Jirani - Service Marketplace",
  "short_name": "Jirani",
  "description": "Connect with local service providers",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "permissions": ["notifications", "geolocation"]
}
```

**4. Geolocation & Maps**

```typescript
// components/service/LocationPicker.tsx
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';

export function LocationPicker({ onLocationSelect }: Props) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY
  });

  const [location, setLocation] = useState<LatLng | null>(null);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const newLocation = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      };
      setLocation(newLocation);
      onLocationSelect(newLocation);
    }
  };

  if (!isLoaded) return <div>Loading map...</div>;

  return (
    <GoogleMap
      zoom={12}
      center={location || { lat: -1.286389, lng: 36.817223 }} // Nairobi
      mapContainerClassName="w-full h-96 rounded-lg"
      onClick={handleMapClick}
    >
      {location && <Marker position={location} />}
    </GoogleMap>
  );
}
```

---

## 7. INFRASTRUCTURE & DEPLOYMENT

### 7.1 Docker Configuration

**Dockerfile (Backend)**

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

**docker-compose.yml (Development)**

```yaml
version: '3.8'

services:
  # NGINX Load Balancer
  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api-1
      - api-2

  # API Instances
  api-1:
    build: ./backend
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/jirani
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      - postgres
      - redis

  api-2:
    build: ./backend
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/jirani
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      - postgres
      - redis

  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=jirani
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '5432:5432'

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - '6379:6379'

  # Elasticsearch
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - 'ES_JAVA_OPTS=-Xms512m -Xmx512m'
      - xpack.security.enabled=false
    volumes:
      - es_data:/usr/share/elasticsearch/data
    ports:
      - '9200:9200'

  # Frontend
  frontend:
    build: ./frontend
    ports:
      - '5173:5173'
    depends_on:
      - nginx

volumes:
  postgres_data:
  redis_data:
  es_data:
```

**nginx.conf**

```nginx
events {
    worker_connections 1024;
}

http {
    upstream api_backend {
        least_conn;
        server api-1:3000 max_fails=3 fail_timeout=30s;
        server api-2:3000 max_fails=3 fail_timeout=30s;
    }

    server {
        listen 80;
        server_name api.jirani.com;

        location / {
            proxy_pass http://api_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
        }
    }

    # Frontend
    server {
        listen 80;
        server_name jirani.com www.jirani.com;

        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }

        # Cache static assets
        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

### 7.2 Kubernetes Configuration (Production)

**deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jirani-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: jirani-api
  template:
    metadata:
      labels:
        app: jirani-api
    spec:
      containers:
        - name: api
          image: jirani/api:latest
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: jirani-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: jirani-secrets
                  key: redis-url
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: jirani-api-service
spec:
  selector:
    app: jirani-api
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: jirani-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: jirani-api
  minReplicas: 3
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

---

## 8. MONITORING & OBSERVABILITY

### 8.1 Logging Strategy

```typescript
// lib/logger.ts
import winston from 'winston'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'jirani-api' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
})

// Usage
logger.info('Booking created', { bookingId, userId, amount })
logger.error('Payment failed', { error, bookingId })
```

### 8.2 Metrics Collection

```typescript
// lib/metrics.ts
import * as prometheus from 'prom-client'

const register = new prometheus.Registry()

// Default metrics
prometheus.collectDefaultMetrics({ register })

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
})

const bookingCounter = new prometheus.Counter({
  name: 'bookings_total',
  help: 'Total number of bookings',
  labelNames: ['status'],
  registers: [register],
})

const escrowGauge = new prometheus.Gauge({
  name: 'escrow_balance_total',
  help: 'Total funds in escrow',
  registers: [register],
})

// Middleware
app.use((req, res, next) => {
  const start = Date.now()

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000
    httpRequestDuration
      .labels(req.method, req.route?.path, res.statusCode.toString())
      .observe(duration)
  })

  next()
})

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})
```

### 8.3 Error Tracking

```typescript
// Sentry integration
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
  ],
})

// Request handler
app.use(Sentry.Handlers.requestHandler())

// Error handler
app.use(Sentry.Handlers.errorHandler())

// Manual error reporting
try {
  await processPayment(booking)
} catch (error) {
  Sentry.captureException(error, {
    tags: { booking_id: booking.id },
    user: { id: booking.customer_id },
  })
  throw error
}
```

---

## 9. TESTING STRATEGY

### 9.1 Testing Pyramid

```
        /\
       /  \
      / E2E\      ← 10% (Cypress, Playwright)
     /------\
    /        \
   /Integration\ ← 30% (Jest + Supertest)
  /------------\
 /              \
/   Unit Tests   \ ← 60% (Jest, Vitest)
------------------
```

### 9.2 Unit Testing Examples

```typescript
// tests/services/escrow.test.ts
import { EscrowService } from '@/services/escrow'
import { db } from '@/lib/db'

jest.mock('@/lib/db')

describe('EscrowService', () => {
  describe('releaseEscrow', () => {
    it('should release funds to provider after booking completion', async () => {
      const mockBooking = {
        id: 'booking-123',
        provider_id: 'provider-456',
        total_amount: 10000,
        status: 'completed',
      }

      const mockEscrow = {
        id: 'escrow-789',
        amount: 10000,
        status: 'held',
      }

      ;(db.bookings.findById as jest.Mock).mockResolvedValue(mockBooking)
      ;(db.escrow.findByBooking as jest.Mock).mockResolvedValue(mockEscrow)

      const result = await EscrowService.release('booking-123')

      expect(result.status).toBe('released')
      expect(result.amount_released).toBe(8500) // After 15% platform fee
      expect(db.transactions.create).toHaveBeenCalledWith({
        type: 'payout',
        user_id: 'provider-456',
        amount: 8500,
      })
    })

    it('should not release if booking is disputed', async () => {
      const mockBooking = {
        id: 'booking-123',
        status: 'disputed',
      }

      ;(db.bookings.findById as jest.Mock).mockResolvedValue(mockBooking)

      await expect(EscrowService.release('booking-123')).rejects.toThrow(
        'Cannot release escrow for disputed booking',
      )
    })
  })
})
```

### 9.3 Integration Testing

```typescript
// tests/api/bookings.integration.test.ts
import request from 'supertest'
import app from '@/app'
import { seedDatabase, clearDatabase } from '@/tests/helpers'

describe('Bookings API', () => {
  beforeAll(async () => {
    await seedDatabase()
  })

  afterAll(async () => {
    await clearDatabase()
  })

  describe('POST /bookings', () => {
    it('should create a booking and hold funds in escrow', async () => {
      const token = await getAuthToken('customer@example.com')

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          service_id: 'service-123',
          scheduled_start: '2025-02-10T10:00:00Z',
          scheduled_end: '2025-02-10T12:00:00Z',
          amount: 5000,
        })

      expect(response.status).toBe(201)
      expect(response.body.data.status).toBe('pending')
      expect(response.body.data.booking_number).toMatch(/BK-\d{8}-\d{4}/)

      // Verify escrow created
      const escrow = await db.escrow.findByBooking(response.body.data.id)
      expect(escrow.amount).toBe(5000)
      expect(escrow.status).toBe('held')
    })
  })
})
```

### 9.4 E2E Testing

```typescript
// e2e/booking-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Complete Booking Flow', () => {
  test('customer can book a service and provider can accept', async ({
    page,
    context,
  }) => {
    // Customer flow
    await page.goto('/')
    await page.click('text=Login')
    await page.fill('[name=email]', 'customer@test.com')
    await page.fill('[name=password]', 'password123')
    await page.click('button[type=submit]')

    // Search for service
    await page.fill('[placeholder="Search services"]', 'plumbing')
    await page.click('button:has-text("Search")')

    // Select first service
    await page.click('.service-card >> nth=0')

    // Book service
    await page.click('text=Book Now')
    await page.click('[data-slot="2025-02-10T10:00"]')
    await page.fill('[name=notes]', 'Please fix kitchen sink')

    // Payment
    await page.click('text=Continue to Payment')
    await page.fill('[name=card_number]', '4242424242424242')
    await page.fill('[name=expiry]', '12/26')
    await page.fill('[name=cvv]', '123')
    await page.click('button:has-text("Pay & Book")')

    await expect(page.locator('text=Booking Request Sent')).toBeVisible()

    // Provider flow (new page)
    const providerPage = await context.newPage()
    await providerPage.goto('/')
    await providerPage.click('text=Login')
    await providerPage.fill('[name=email]', 'provider@test.com')
    await providerPage.fill('[name=password]', 'password123')
    await providerPage.click('button[type=submit]')

    // Check notification
    await expect(providerPage.locator('.notification-badge')).toContainText('1')

    // View booking request
    await providerPage.click('text=Bookings')
    await providerPage.click('.booking-card >> nth=0')
    await providerPage.click('button:has-text("Accept Booking")')

    await expect(providerPage.locator('text=Booking Accepted')).toBeVisible()

    // Verify customer sees acceptance
    await expect(page.locator('.booking-status')).toContainText('Accepted')
  })
})
```

---

## 10. PERFORMANCE OPTIMIZATION

### 10.1 Database Query Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_services_category ON services(category_id) WHERE is_active = true;
CREATE INDEX idx_services_location ON services USING GIST(service_area);
CREATE INDEX idx_bookings_date_range ON bookings(scheduled_start, scheduled_end);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, created_at DESC);

-- Composite indexes
CREATE INDEX idx_bookings_provider_status ON bookings(provider_id, status, created_at);

-- Partial indexes
CREATE INDEX idx_active_services ON services(provider_id) WHERE is_active = true;

-- Use query explain to optimize
EXPLAIN ANALYZE
SELECT s.*, u.full_name, ps.average_rating
FROM services s
JOIN user_profiles u ON s.provider_id = u.user_id
JOIN provider_stats ps ON s.provider_id = ps.provider_id
WHERE s.category_id = $1
  AND s.is_active = true
  AND ST_DWithin(s.service_area::geography, ST_SetSRID(ST_Point($2, $3), 4326)::geography, 10000)
ORDER BY ps.average_rating DESC
LIMIT 20;
```

### 10.2 Caching Strategy

```typescript
// Multi-layer caching
import Redis from 'ioredis'
import NodeCache from 'node-cache'

// L1: In-memory cache (fastest, limited size)
const memoryCache = new NodeCache({ stdTTL: 60 })

// L2: Redis cache (shared across instances)
const redis = new Redis(process.env.REDIS_URL)

class CacheService {
  async get<T>(key: string): Promise<T | null> {
    // Check L1 cache
    const memoryResult = memoryCache.get<T>(key)
    if (memoryResult) return memoryResult

    // Check L2 cache
    const redisResult = await redis.get(key)
    if (redisResult) {
      const parsed = JSON.parse(redisResult)
      memoryCache.set(key, parsed) // Populate L1
      return parsed
    }

    return null
  }

  async set(key: string, value: any, ttl: number = 300) {
    const serialized = JSON.stringify(value)

    // Set both layers
    memoryCache.set(key, value, ttl)
    await redis.setex(key, ttl, serialized)
  }

  async invalidate(pattern: string) {
    // Invalidate L1
    memoryCache.flushAll()

    // Invalidate L2
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }
}

// Usage
const cacheService = new CacheService()

async function getService(id: string) {
  const cached = await cacheService.get(`service:${id}`)
  if (cached) return cached

  const service = await db.services.findById(id)
  await cacheService.set(`service:${id}`, service, 600)

  return service
}

// Invalidate on update
async function updateService(id: string, data: any) {
  const updated = await db.services.update(id, data)
  await cacheService.invalidate(`service:${id}`)
  await cacheService.invalidate('services:*') // Invalidate lists
  return updated
}
```

### 10.3 API Response Optimization

```typescript
// Pagination helper
interface PaginationOptions {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

async function paginate<T>(
  query: any,
  options: PaginationOptions,
): Promise<PaginatedResponse<T>> {
  const { page, limit, sortBy = 'created_at', sortOrder = 'desc' } = options
  const offset = (page - 1) * limit

  const [data, total] = await Promise.all([
    query.orderBy(sortBy, sortOrder).limit(limit).offset(offset),
    query.clone().count(),
  ])

  return {
    data,
    pagination: {
      page,
      per_page: limit,
      total: total[0].count,
      total_pages: Math.ceil(total[0].count / limit),
      has_next: page * limit < total[0].count,
      has_prev: page > 1,
    },
  }
}

// Field selection (sparse fieldsets)
app.get('/services', async (req, res) => {
  const fields = req.query.fields?.split(',') || ['*']

  const services = await db.services.select(fields).where({ is_active: true })

  res.json({ success: true, data: services })
})

// Response compression
import compression from 'compression'
app.use(compression())

// ETags for conditional requests
app.use((req, res, next) => {
  const etag = generateEtag(res.body)
  res.setHeader('ETag', etag)

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end()
    return
  }

  next()
})
```

### 10.4 Image Optimization

```typescript
// Image processing with Sharp
import sharp from 'sharp'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({ region: process.env.AWS_REGION })

async function uploadServiceImage(
  file: Express.Multer.File,
  serviceId: string,
) {
  const variants = [
    { name: 'thumbnail', width: 150, height: 150 },
    { name: 'small', width: 400, height: 300 },
    { name: 'medium', width: 800, height: 600 },
    { name: 'large', width: 1200, height: 900 },
  ]

  const uploads = variants.map(async (variant) => {
    const processed = await sharp(file.buffer)
      .resize(variant.width, variant.height, { fit: 'cover' })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer()

    const key = `services/${serviceId}/${variant.name}.jpg`

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: processed,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000',
      }),
    )

    return {
      variant: variant.name,
      url: `https://${process.env.CDN_URL}/${key}`,
    }
  })

  return await Promise.all(uploads)
}
```

---

## 11. IMPLEMENTATION ROADMAP

### Phase 1: MVP (8-10 weeks)

**Week 1-2: Setup & Foundation**

- Project setup (frontend + backend)
- Database schema implementation
- Docker configuration
- CI/CD pipeline setup

**Week 3-4: Core Features**

- User authentication (register, login, email verification)
- Service creation & management
- Basic search functionality
- User profiles

**Week 5-6: Booking System**

- Availability management
- Booking creation flow
- Basic notification system (email)
- Provider acceptance/rejection

**Week 7-8: Payments & Escrow**

- Stripe integration
- M-Pesa integration (critical for Kenya)
- Escrow system implementation
- Payment webhooks

**Week 9-10: Reviews & Polish**

- Rating system
- Review submission
- Basic dispute handling
- UI/UX refinement
- Testing & bug fixes

**MVP Features:**
✅ User registration & authentication
✅ Service creation & search
✅ Booking system
✅ Payments & escrow
✅ Basic ratings
✅ Email notifications
✅ Mobile-responsive UI

### Phase 2: Enhanced Features (6-8 weeks)

- Real-time notifications (Socket.io)
- Advanced search (Elasticsearch)
- Calendar integrations
- In-app messaging
- Dispute resolution system
- Provider analytics dashboard
- Background checks & verification
- PWA implementation

### Phase 3: Scale & Optimize (4-6 weeks)

- Kubernetes deployment
- Advanced caching
- Image CDN
- Recommendation engine
- Mobile apps (React Native)
- Admin dashboard
- Fraud detection
- Performance optimization

### Phase 4: Advanced Features (Ongoing)

- Multi-language support
- Advanced analytics & ML
- Subscription plans for providers
- Team/Agency accounts
- Service packages & bundles
- Loyalty programs
- API for third-party integrations

---

## 12. COST ESTIMATION (Monthly - Production)

**Infrastructure (AWS/GCP):**

- Load Balancer: $20
- Compute (3 instances): $150
- Database (RDS/Cloud SQL): $100
- Redis (Managed): $40
- Elasticsearch: $80
- Storage (S3/GCS): $50
- CDN: $30
- **Total: ~$470/month**

**Third-Party Services:**

- Stripe (2.9% + $0.30 per transaction)
- M-Pesa (varies by volume)
- Sentry: $26/month
- Email (SendGrid): $20/month
- SMS (Twilio): Variable
- Maps API: ~$50/month
- **Total: ~$100/month + transaction fees**

**Total Monthly: ~$600 + scaling costs**

---

## 13. SECURITY CHECKLIST

✅ HTTPS only (TLS 1.3)
✅ JWT with refresh tokens
✅ Password hashing (bcrypt, cost: 12)
✅ SQL injection prevention (parameterized queries)
✅ XSS protection (input sanitization)
✅ CSRF protection
✅ Rate limiting
✅ Input validation (all endpoints)
✅ Output encoding
✅ Security headers (Helmet.js)
✅ CORS configuration
✅ File upload restrictions
✅ Payment tokenization (no raw card storage)
✅ Audit logging
✅ Data encryption at rest
✅ Regular security scans
✅ Dependency updates
✅ Environment variables (no secrets in code)
✅ Principle of least privilege
✅ Multi-factor authentication

---

## 14. CONCLUSION

This architecture provides a production-ready foundation for Jirani. Key highlights:

1. **Scalable Architecture** - Designed to handle millions of users
2. **Security First** - PCI DSS compliant, encrypted, audited
3. **Local Focus** - M-Pesa integration for Kenyan market
4. **Real-time Features** - WebSockets for instant updates
5. **Robust Escrow** - Safe payment handling with dispute resolution
6. **Performance Optimized** - Multi-layer caching, CDN, query optimization
7. **Maintainable Code** - TypeScript, tested, documented

**Critical Success Factors:**

- Start with MVP and iterate
- Monitor metrics from day one
- Listen to user feedback
- Scale incrementally
- Maintain code quality
- Prioritize security

**Next Steps:**

1. Review this architecture with your team
2. Set up development environment
3. Create detailed user stories
4. Begin Phase 1 implementation
5. Set up monitoring & analytics early
6. Plan regular security audits

Good luck building Jirani! 🚀
