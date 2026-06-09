/**
 * Mock Vendure Shop API server for E2E tests.
 *
 * Listens on http://localhost:9999/shop-api and responds to a small set of
 * GraphQL operations sufficient to drive the storefront through:
 *  - PDP / koszyk render (activeOrder query)
 *  - checkout GET (activeOrder + eligibleShippingMethods + activeChannel)
 *  - checkout POST (setCustomer / setShippingAddress / setShippingMethod /
 *    setOrderCustomFields / transitionOrderToState / addPaymentToOrder)
 *  - potwierdzenie GET (orderByCode)
 *
 * Test control endpoints:
 *  - POST /__test__/reset       — wipe in-memory state to defaults
 *  - POST /__test__/seed-cart   — seed an active order with a single line so
 *                                  the storefront treats /checkout as having a cart
 *
 * Notes:
 *  - We do NOT validate auth tokens / channel tokens — the storefront forwards
 *    them via Authorization / vendure-token headers but the mock ignores them.
 *  - All operations return the minimal subset of fields each storefront query
 *    actually selects — keeping the surface tight makes tests deterministic.
 */

import express, { type Request, type Response } from 'express';

interface MockOrderLine {
  id: string;
  quantity: number;
  unitPriceWithTax: number;
  linePriceWithTax: number;
  productVariant: {
    id: string;
    name: string;
    sku: string;
    productId: string;
    product: {
      id: string;
      name: string;
      slug: string;
      featuredAsset: { id: string; preview: string } | null;
    };
  };
}

interface MockOrder {
  id: string;
  code: string;
  state: string;
  totalQuantity: number;
  subTotal: number;
  subTotalWithTax: number;
  shipping: number;
  shippingWithTax: number;
  total: number;
  totalWithTax: number;
  currencyCode: string;
  couponCodes: string[];
  discounts: Array<{ description: string; amountWithTax: number }>;
  shippingLines: Array<{
    priceWithTax: number;
    shippingMethod: { id: string; name: string };
  }>;
  lines: MockOrderLine[];
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress: string;
    phoneNumber: string;
  } | null;
  shippingAddress: {
    fullName: string;
    streetLine1: string;
    streetLine2: string | null;
    city: string;
    postalCode: string;
    country: string;
    phoneNumber: string;
  } | null;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
    state: string;
    metadata: Record<string, unknown>;
  }>;
  customFields: Record<string, unknown>;
  createdAt: string;
}

interface MockState {
  activeOrder: MockOrder | null;
  // orders indexed by code for orderByCode lookup
  ordersByCode: Map<string, MockOrder>;
}

// ─── Defaults / seed builders ─────────────────────────────────────

const DEFAULT_SHIPPING_METHODS = [
  {
    id: 'sm-1',
    name: 'Paczkomat InPost',
    code: 'inpost-paczkomat',
    description: 'Dostawa do paczkomatu — 1-2 dni robocze',
    price: 1199,
    priceWithTax: 1199,
  },
  {
    id: 'sm-2',
    name: 'Kurier InPost',
    code: 'inpost-kurier',
    description: 'Kurier pod drzwi',
    price: 1499,
    priceWithTax: 1499,
  },
  {
    id: 'sm-3',
    name: 'Pobranie kurier',
    code: 'kurier-pobranie',
    description: 'Płatność przy odbiorze',
    price: 1999,
    priceWithTax: 1999,
  },
];

function buildSeededOrder(overrides: Partial<MockOrder> = {}): MockOrder {
  const unit = 5000;
  const qty = 1;
  return {
    id: 'order-1',
    code: 'MOCK_TEST_001',
    state: 'AddingItems',
    totalQuantity: qty,
    subTotal: unit * qty,
    subTotalWithTax: unit * qty,
    shipping: 0,
    shippingWithTax: 0,
    total: unit * qty,
    totalWithTax: unit * qty,
    currencyCode: 'PLN',
    couponCodes: [],
    discounts: [],
    shippingLines: [],
    lines: [
      {
        id: 'line-1',
        quantity: qty,
        unitPriceWithTax: unit,
        linePriceWithTax: unit * qty,
        productVariant: {
          id: 'variant-1',
          name: 'BezSmugi Zestaw 3 sztuk',
          sku: 'BEZSMUGI-3PACK',
          productId: 'product-1',
          product: {
            id: 'product-1',
            name: 'BezSmugi Zestaw',
            slug: 'bezsmugi-zestaw',
            featuredAsset: { id: 'asset-1', preview: 'https://example.invalid/preview.jpg' },
          },
        },
      },
    ],
    customer: null,
    shippingAddress: null,
    payments: [],
    customFields: {},
    createdAt: '2026-04-28T10:00:00.000Z',
    ...overrides,
  };
}

function freshState(): MockState {
  return {
    activeOrder: null,
    ordersByCode: new Map(),
  };
}

let state: MockState = freshState();

// ─── GraphQL operation routing ────────────────────────────────────

interface GraphQLBody {
  query?: string;
  variables?: Record<string, any>;
}

function detectOperation(query: string): string {
  // crude but effective — match the operation name keyword
  const m = query.match(/(?:query|mutation)\s+(\w+)/);
  if (m) return m[1];
  // fallback: match outer field
  const f = query.match(/\b(activeOrder|eligibleShippingMethods|eligiblePaymentMethods|activeChannel|orderByCode|setCustomerForOrder|setOrderShippingAddress|setOrderShippingMethod|setOrderCustomFields|transitionOrderToState|addPaymentToOrder|addItemToOrder|adjustOrderLine|removeOrderLine|applyCouponCode|removeCouponCode)\b/);
  return f ? f[1] : 'unknown';
}

function recomputeTotals(order: MockOrder): void {
  order.subTotal = order.lines.reduce((s, l) => s + l.linePriceWithTax, 0);
  order.subTotalWithTax = order.subTotal;
  order.totalQuantity = order.lines.reduce((s, l) => s + l.quantity, 0);
  const shipping = order.shippingLines.reduce((s, sl) => s + sl.priceWithTax, 0);
  order.shipping = shipping;
  order.shippingWithTax = shipping;
  order.total = order.subTotal + shipping;
  order.totalWithTax = order.subTotalWithTax + shipping;
}

function handleGraphQL(body: GraphQLBody, _req: Request): { data?: any; errors?: any[] } {
  const query = body.query || '';
  const variables = body.variables || {};
  const op = detectOperation(query);

  switch (op) {
    case 'GetActiveOrder':
    case 'activeOrder': {
      return { data: { activeOrder: state.activeOrder } };
    }

    case 'GetEligibleShippingMethods':
    case 'eligibleShippingMethods': {
      return { data: { eligibleShippingMethods: DEFAULT_SHIPPING_METHODS } };
    }

    case 'GetEligiblePaymentMethods':
    case 'eligiblePaymentMethods': {
      return {
        data: {
          eligiblePaymentMethods: [
            { id: 'pm-1', name: 'PayU', code: 'payu', description: '', isEligible: true, eligibilityMessage: null },
            { id: 'pm-2', name: 'Pobranie', code: 'cod', description: '', isEligible: true, eligibilityMessage: null },
          ],
        },
      };
    }

    case 'activeChannel': {
      return {
        data: {
          activeChannel: {
            id: 'channel-1',
            code: 'bezsmugi',
            customFields: {
              storeName: 'ZmyjSmugi',
              storeTagline: 'Zestaw 3 sciereczek mikrofibra',
              contactEmail: 'sklep@zmyjsmugi.pl',
              contactPhone: null,
              freeShippingThreshold: 15000,
              promoBarText: null,
              promoBarLink: null,
              companyName: null,
              companyNip: null,
              companyAddress: null,
              returnAddress: null,
              inpostGeowidgetToken: 'mock-inpost-token',
              metaPixelId: null,
              metaDatasetId: null,
            },
          },
        },
      };
    }

    case 'GetStoreConfig': {
      return {
        data: {
          activeChannel: {
            id: 'channel-1',
            code: 'bezsmugi',
            customFields: {
              storeName: 'ZmyjSmugi',
              storeTagline: 'Zestaw 3 sciereczek mikrofibra',
              contactEmail: 'sklep@zmyjsmugi.pl',
              contactPhone: null,
              freeShippingThreshold: 15000,
              promoBarText: null,
              promoBarLink: null,
              companyName: null,
              companyNip: null,
              companyAddress: null,
              returnAddress: null,
              inpostGeowidgetToken: 'mock-inpost-token',
              metaPixelId: null,
              metaDatasetId: null,
            },
          },
        },
      };
    }

    case 'GetProductDetail':
    case 'product': {
      return {
        data: {
          product: {
            id: 'product-1',
            name: 'BezSmugi Zestaw',
            description: 'Zestaw 3 sciereczek mikrofibra',
            slug: 'bezsmugi-zestaw',
            customFields: { shortDescription: '3 sciereczki, 50 zl' },
            featuredAsset: { id: 'asset-1', name: 'hero', preview: 'https://example.invalid/preview.jpg' },
            assets: [],
            variants: [
              {
                id: 'variant-1',
                name: 'BezSmugi Zestaw 3 sztuk',
                sku: 'BEZSMUGI-3PACK',
                priceWithTax: 5000,
                stockLevel: 'IN_STOCK',
                customFields: { lowestPrice30d: 6700 },
                options: [],
              },
            ],
            optionGroups: [],
            collections: [],
          },
        },
      };
    }

    case 'GetOrderByCode':
    case 'orderByCode': {
      const code = variables.code as string;
      const found = state.ordersByCode.get(code) || (state.activeOrder?.code === code ? state.activeOrder : null);
      return { data: { orderByCode: found } };
    }

    case 'AddToCart':
    case 'addItemToOrder': {
      if (!state.activeOrder) state.activeOrder = buildSeededOrder({ lines: [] });
      const variantId = String(variables.variantId);
      const quantity = Number(variables.quantity) || 1;
      const existing = state.activeOrder.lines.find((l) => l.productVariant.id === variantId);
      if (existing) {
        existing.quantity += quantity;
        existing.linePriceWithTax = existing.unitPriceWithTax * existing.quantity;
      } else {
        state.activeOrder.lines.push({
          id: `line-${state.activeOrder.lines.length + 1}`,
          quantity,
          unitPriceWithTax: 5000,
          linePriceWithTax: 5000 * quantity,
          productVariant: {
            id: variantId,
            name: 'BezSmugi Zestaw',
            sku: 'BEZSMUGI-3PACK',
            productId: 'product-1',
            product: {
              id: 'product-1',
              name: 'BezSmugi Zestaw',
              slug: 'bezsmugi-zestaw',
              featuredAsset: { id: 'asset-1', preview: 'https://example.invalid/preview.jpg' },
            },
          },
        });
      }
      recomputeTotals(state.activeOrder);
      return { data: { addItemToOrder: { __typename: 'Order', ...state.activeOrder } } };
    }

    case 'SetCustomerForOrder':
    case 'setCustomerForOrder': {
      if (!state.activeOrder) {
        return { data: { setCustomerForOrder: { __typename: 'NoActiveOrderError', errorCode: 'NO_ACTIVE_ORDER_ERROR', message: 'No active order' } } };
      }
      const input = variables.input || {};
      state.activeOrder.customer = {
        id: 'customer-1',
        firstName: input.firstName || '',
        lastName: input.lastName || '',
        emailAddress: input.emailAddress || '',
        phoneNumber: input.phoneNumber || '',
      };
      return { data: { setCustomerForOrder: { __typename: 'Order', id: state.activeOrder.id, code: state.activeOrder.code, customer: state.activeOrder.customer } } };
    }

    case 'SetOrderShippingAddress':
    case 'setOrderShippingAddress': {
      if (!state.activeOrder) {
        return { data: { setOrderShippingAddress: { __typename: 'NoActiveOrderError', errorCode: 'NO_ACTIVE_ORDER_ERROR', message: 'No active order' } } };
      }
      const input = variables.input || {};
      state.activeOrder.shippingAddress = {
        fullName: input.fullName || '',
        streetLine1: input.streetLine1 || '',
        streetLine2: null,
        city: input.city || '',
        postalCode: input.postalCode || '',
        country: input.countryCode || 'PL',
        phoneNumber: input.phoneNumber || '',
      };
      return { data: { setOrderShippingAddress: { __typename: 'Order', id: state.activeOrder.id, code: state.activeOrder.code, shippingAddress: state.activeOrder.shippingAddress } } };
    }

    case 'SetOrderShippingMethod':
    case 'setOrderShippingMethod': {
      if (!state.activeOrder) {
        return { data: { setOrderShippingMethod: { __typename: 'NoActiveOrderError', errorCode: 'NO_ACTIVE_ORDER_ERROR', message: 'No active order' } } };
      }
      const ids: string[] = Array.isArray(variables.shippingMethodId) ? variables.shippingMethodId : [variables.shippingMethodId];
      const id = ids[0];
      const method = DEFAULT_SHIPPING_METHODS.find((m) => m.id === id);
      if (!method) {
        return { data: { setOrderShippingMethod: { __typename: 'OrderModificationError', errorCode: 'ORDER_MODIFICATION_ERROR', message: 'Unknown shipping method' } } };
      }
      state.activeOrder.shippingLines = [{ priceWithTax: method.priceWithTax, shippingMethod: { id: method.id, name: method.name } }];
      recomputeTotals(state.activeOrder);
      return {
        data: {
          setOrderShippingMethod: {
            __typename: 'Order',
            id: state.activeOrder.id,
            code: state.activeOrder.code,
            shippingWithTax: state.activeOrder.shippingWithTax,
            totalWithTax: state.activeOrder.totalWithTax,
            shippingLines: state.activeOrder.shippingLines,
          },
        },
      };
    }

    case 'SetOrderCustomFields':
    case 'setOrderCustomFields': {
      if (!state.activeOrder) {
        return { data: { setOrderCustomFields: { __typename: 'NoActiveOrderError', errorCode: 'NO_ACTIVE_ORDER_ERROR', message: 'No active order' } } };
      }
      const input = variables.input || {};
      state.activeOrder.customFields = { ...state.activeOrder.customFields, ...(input.customFields || {}) };
      return { data: { setOrderCustomFields: { __typename: 'Order', id: state.activeOrder.id } } };
    }

    case 'TransitionOrderToState':
    case 'transitionOrderToState': {
      if (!state.activeOrder) {
        return { data: { transitionOrderToState: { __typename: 'OrderStateTransitionError', errorCode: 'ORDER_STATE_TRANSITION_ERROR', message: 'No active order', transitionError: '', fromState: '', toState: '' } } };
      }
      state.activeOrder.state = String(variables.state);
      return { data: { transitionOrderToState: { __typename: 'Order', id: state.activeOrder.id, code: state.activeOrder.code, state: state.activeOrder.state } } };
    }

    case 'AddPaymentToOrder':
    case 'addPaymentToOrder': {
      if (!state.activeOrder) {
        return { data: { addPaymentToOrder: { __typename: 'NoActiveOrderError', errorCode: 'NO_ACTIVE_ORDER_ERROR', message: 'No active order' } } };
      }
      const input = variables.input || {};
      const method = String(input.method || '');
      const metadataIn = (input.metadata || {}) as Record<string, unknown>;
      const flowType = String(metadataIn.flowType || '');

      let paymentMetadata: Record<string, unknown>;
      let nextState: string;

      if (method === 'payu') {
        // REDIRECT / PAYPO / BLIK — return a redirectUri under metadata.public so the
        // storefront's payment redirect branch fires.
        const redirectUri = 'https://secure.payu.com/pay/?orderId=MOCK_TEST_001';
        paymentMetadata = {
          public: {
            redirectUri,
            statusCode: 'WARNING_CONTINUE_REDIRECT',
            extOrderId: state.activeOrder.code,
            orderId: 'PAYU-MOCK-001',
          },
        };
        nextState = 'PaymentAuthorized';
      } else if (method === 'cod') {
        paymentMetadata = {};
        nextState = 'PaymentSettled';
      } else {
        paymentMetadata = {};
        nextState = 'PaymentAuthorized';
      }

      const payment = {
        id: `payment-${state.activeOrder.payments.length + 1}`,
        method,
        amount: state.activeOrder.totalWithTax,
        state: nextState,
        metadata: paymentMetadata,
      };
      state.activeOrder.payments.push(payment);
      state.activeOrder.state = nextState;

      // Snapshot order under code for orderByCode lookups (potwierdzenie page).
      state.ordersByCode.set(state.activeOrder.code, JSON.parse(JSON.stringify(state.activeOrder)));

      // Hint to caller about flowType so we don't accidentally drop it (storefront
      // reads it back from formValues, not from this response).
      void flowType;

      return {
        data: {
          addPaymentToOrder: {
            __typename: 'Order',
            id: state.activeOrder.id,
            code: state.activeOrder.code,
            state: state.activeOrder.state,
            totalWithTax: state.activeOrder.totalWithTax,
            totalQuantity: state.activeOrder.totalQuantity,
            payments: state.activeOrder.payments,
            // also include lines so storefront's CAPI Purchase event can read them
            lines: state.activeOrder.lines,
          },
        },
      };
    }

    default: {
      return { errors: [{ message: `Unhandled mock operation: ${op}`, query: query.slice(0, 200) }] };
    }
  }
}

// ─── HTTP server ───────────────────────────────────────────────────

export interface MockServerHandle {
  url: string;
  close: () => Promise<void>;
}

export async function startMockServer(port = 9999): Promise<MockServerHandle> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/shop-api', (req, res) => {
    const body = (req.body || {}) as GraphQLBody;
    const result = handleGraphQL(body, req);
    res.status(200).json(result);
  });

  // Test control endpoints
  app.post('/__test__/reset', (_req, res) => {
    state = freshState();
    res.json({ ok: true });
  });

  app.post('/__test__/seed-cart', (req: Request, res: Response) => {
    const overrides = (req.body || {}) as Partial<MockOrder>;
    state.activeOrder = buildSeededOrder(overrides);
    res.json({ ok: true, order: state.activeOrder });
  });

  app.get('/__test__/state', (_req, res) => {
    res.json(state);
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve({
        url: `http://localhost:${port}/shop-api`,
        close: () =>
          new Promise<void>((r, rj) => {
            server.close((err) => (err ? rj(err) : r()));
          }),
      });
    });
  });
}

// CLI entrypoint — `tsx tests/mocks/vendure-mock.ts`
if (process.argv[1] && process.argv[1].includes('vendure-mock')) {
  const port = Number(process.env.MOCK_PORT || 9999);
  startMockServer(port).then((handle) => {
    // eslint-disable-next-line no-console
    console.log(`[mock] Vendure mock listening on ${handle.url}`);
  });
}
