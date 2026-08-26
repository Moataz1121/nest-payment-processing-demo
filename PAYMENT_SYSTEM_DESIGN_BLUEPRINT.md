# System Design Blueprint: Decoupled Multi-Gateway Payment System

> **Target Audience / AI Agent Prompting**: This document provides a framework-agnostic architectural specification for building a high-concurrency, transactionally-consistent payment and inventory reservation system. It is specifically designed to serve as a blueprint for implementing the same business architecture in a **NestJS** (TypeScript / TypeORM / Prisma) backend.

---

## 1. Core Architectural Overview

The payment system architecture decouples core business logic (Order creation, Inventory reservation, Payment state tracking) from specific payment provider implementations (Moyasar, Stripe, PayPal, etc.).

### Primary Goals
1. **Zero Overselling / Concurrency Safety**: Uses pessimistic row locking (`SELECT ... FOR UPDATE`) in deterministic order to eliminate inventory race conditions.
2. **Double-Layered Idempotency**: Prevents duplicate user checkouts at the API level and double-charging at the payment provider level.
3. **Short DB Lock Boundaries**: Database transactions are kept short (~1ms) and **never** held open during external HTTP calls to payment gateways.
4. **Strategy & Factory Pattern**: Provider integrations are encapsulated as interchangeable strategies instantiated via a central factory.
5. **State Transition Protection**: Prevents terminal state regressions (e.g. `COMPLETED` payment status cannot regress to `PROCESSING` or `FAILED`).

---

## 2. Strategy & Factory Design Patterns

### Class Diagram

```
                             +-------------------------------+
                             |    PaymentGatewayStrategy     |  (Interface)
                             +---------------+---------------+
                                             |
            +--------------------------------+--------------------------------+
            |                                |                                |
+-----------v------------+      +------------v-----------+      +-------------v----------+
| MoyasarPaymentStrategy |      | StripePaymentStrategy  |      |   MockPaymentStrategy  |
+------------------------+      +------------------------+      +------------------------+
            ^                                ^                                ^
            |                                |                                |
            +--------------------------------+--------------------------------+
                                             | (Instantiates)
                             +---------------+---------------+
                             |     PaymentGatewayFactory     |
                             +-------------------------------+
```

### Gateway Contract Interface (TypeScript / NestJS Definition)

```typescript
export interface ProcessPaymentResult {
  success: boolean;
  paymentId: string;
  transactionId?: string | null;
  status: 'processing' | 'completed' | 'failed';
  paymentUrl?: string | null;
  message: string;
  retryable?: boolean;
  data?: Record<string, any>;
}

export interface CallbackResult {
  success: boolean;
  paymentId: string;
  status: 'completed' | 'failed';
  message: string;
  data?: Record<string, any>;
}

export interface PaymentGatewayStrategy {
  /**
   * Process payment request with provider API using gateway-level idempotency key.
   */
  processPayment(
    payment: PaymentEntity,
    gatewayIdempotencyKey?: string
  ): Promise<ProcessPaymentResult>;

  /**
   * Handle user browser callback after gateway portal redirection.
   */
  callback(request: any): Promise<CallbackResult>;

  /**
   * Process asynchronous server-to-server webhook event.
   */
  handleWebhook(request: any): Promise<CallbackResult>;

  /**
   * Execute partial or full refund.
   */
  processRefund(
    payment: PaymentEntity,
    amount: number,
    reason?: string
  ): Promise<{ success: boolean; refundedAmount: number; message: string }>;
}
```

### Gateway Factory (NestJS Dependency Injection)

```typescript
@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly moyasarStrategy: MoyasarPaymentStrategy,
    private readonly stripeStrategy: StripePaymentStrategy,
    private readonly mockStrategy: MockPaymentStrategy,
  ) {}

  public getStrategy(gatewaySlug: string): PaymentGatewayStrategy {
    switch (gatewaySlug.toLowerCase()) {
      case 'moyasar':
        return this.moyasarStrategy;
      case 'stripe':
        return this.stripeStrategy;
      default:
        return this.mockStrategy;
    }
  }
}
```

---

## 3. Double-Layered Idempotency Specification

### Layer 1: Application-Level Idempotency (`user_id` + `idempotency_key`)

* **Database Constraint**: `UNIQUE(user_id, idempotency_key)` on the `payments` table.
* **Mechanism**:
  1. Client sends checkout payload with an `idempotency_key` (e.g. `IDEM-KEY-998811`).
  2. Server queries existing payment for `(user_id, idempotency_key)`.
  3. If exists: Returns existing payment payload with `is_idempotent: true`.
  4. If simultaneous concurrent requests bypass memory check: Database unique constraint throws a conflict error, caught to return the existing payment safely.

### Layer 2: Gateway-Level Idempotency (`pay_idem_{payment_id}`)

* **Mechanism**:
  1. Every attempt passed to a gateway strategy includes a deterministic key: `pay_idem_{payment_id}`.
  2. Key is passed via HTTP headers (e.g. `Idempotency-Key: pay_idem_abc123`) or metadata payload.
  3. If network connection times out during HTTP request, retrying with the same key ensures the provider returns the existing charge rather than double-charging.

---

## 4. High-Concurrency Inventory Reservation Architecture

### Physical vs. Reserved Stock Math

* `quantity`: Total physical stock owned.
* `reserved_quantity`: Pending stock reserved for active uncompleted checkouts.
* `available_quantity`: $\text{quantity} - \text{reserved\_quantity}$

```
                  [ Checkout Initiated ]
                            |
                            v
            +-------------------------------+
            |  SELECT ... FOR UPDATE        | (Product rows locked by ID ASC)
            +---------------+---------------+
                            |
                            v
             Validate: available >= qty
             increment: reserved_quantity += qty
                            |
           +----------------+----------------+
           |                                 |
           v                                 v
[ Payment COMPLETED ]              [ Payment FAILED / CANCELLED ]
           |                                 |
           v                                 v
 quantity -= qty                   reserved_quantity -= qty
 reserved_quantity -= qty          (Physical stock untouched)
 (Converted to Sold Stock)
```

### Deterministic Lock Ordering Rule (Deadlock Prevention)

To prevent database deadlocks under high-concurrency traffic, all product rows **must** be locked in ascending numeric ID order:

```typescript
// NestJS / TypeORM / Prisma Example
const sortedProductIds = [...items.map(i => i.productId)].sort((a, b) => a - b);

const products = await entityManager.getRepository(Product)
  .createQueryBuilder('product')
  .setLock('pessimistic_write')
  .where('product.id IN (:...ids)', { ids: sortedProductIds })
  .orderBy('product.id', 'ASC')
  .getMany();
```

---

## 5. Short DB Lock Boundaries & Attempt Ownership

### Database Schema for Single Active Attempt

```sql
CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,
    payment_id UUID NOT NULL REFERENCES payments(id),
    active_payment_id UUID UNIQUE NULLABLE, -- Enforces 1 active attempt at DB engine level
    attempt_number INT NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'processing', 'succeeded', 'failed'
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    UNIQUE(payment_id, attempt_number)
);
```

### 3-Step Execution Pipeline (No DB Locks During HTTP Calls)

```
[ Step A: Short DB Transaction (~1ms) ]
  1. Lock Payment row (FOR UPDATE).
  2. Verify payment status is retryable (canBeRetried() === true).
  3. Verify active_payment_id IS NULL.
  4. INSERT PaymentAttempt (active_payment_id = payment_id, status = 'processing').
  5. Update Payment status = 'processing'.
  6. COMMIT Transaction.
             |
             v
[ Step B: Gateway HTTP Call (Outside DB Transaction) ]
  Call Gateway Strategy API with idempotencyKey = "pay_idem_{payment_id}".
  Zero database rows locked during HTTP wait!
             |
             v
[ Step C: Short DB Transaction (~1ms) ]
  1. Lock Payment row (FOR UPDATE).
  2. State Regression Guard: If payment status === 'completed', preserve 'completed'!
  3. UPDATE PaymentAttempt (active_payment_id = NULL, status = resultStatus, finished_at = now()).
  4. UPDATE Payment status.
  5. Execute Inventory Settlement within transaction.
  6. COMMIT Transaction.
```

---

## 6. State Machine & Transition Rules

### State Machine Transition Matrix

| Current Status | Allowed Target Statuses | Can Retry? |
| :--- | :--- | :--- |
| `pending` | `processing`, `completed`, `failed`, `cancelled`, `expired` | Yes |
| `processing` | `completed`, `failed`, `cancelled`, `expired` | Yes |
| `failed` | `processing`, `cancelled`, `expired` | Yes (if transient) |
| `completed` | `refunded`, `partially_refunded` | **NO** |
| `cancelled` | None | **NO** |
| `expired` | None | **NO** |

---

## 7. NestJS Service Reference Implementation Structure

When building this in NestJS, maintain this directory layout:

```
src/
└── modules/
    └── payment/
        ├── controllers/
        │   ├── checkout.controller.ts
        │   └── payment-callback.controller.ts
        ├── enums/
        │   ├── payment-status.enum.ts
        │   └── order-status.enum.ts
        ├── interfaces/
        │   └── payment-gateway.interface.ts
        ├── services/
        │   ├── payment.service.ts
        │   └── payment-gateway.factory.ts
        └── strategies/
            ├── moyasar-payment.strategy.ts
            ├── stripe-payment.strategy.ts
            └── mock-payment.strategy.ts
```

### Summary of System Invariants
1. $\text{quantity} \ge \text{reserved\_quantity} \ge 0$
2. Database unique index `(user_id, idempotency_key)` is final authority on idempotency.
3. Database unique index `(active_payment_id)` is final authority on single active attempt.
4. Product locking order is always `product_id ASC`.
5. DB lock boundaries are kept strictly separate from external HTTP gateway calls.
