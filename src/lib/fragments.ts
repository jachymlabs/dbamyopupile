/**
 * Shared GraphQL fragments — single source of truth.
 * Import these in queries.ts, mutations.ts, and vendure-api.ts.
 */

export const ORDER_FRAGMENT = `
  id
  code
  state
  totalQuantity
  subTotalWithTax
  totalWithTax
  shippingWithTax
  currencyCode
  couponCodes
  discounts {
    description
    amountWithTax
  }
  lines {
    id
    quantity
    unitPriceWithTax
    linePriceWithTax
    productVariant {
      id
      name
      sku
      product {
        id
        name
        slug
        featuredAsset {
          id
          preview
        }
      }
    }
  }
`;
