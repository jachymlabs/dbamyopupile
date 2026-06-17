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
  shippingLines {
    priceWithTax
    shippingMethod {
      id
      name
    }
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
      featuredAsset {
        id
        preview
      }
      options {
        id
        code
        name
        group {
          id
          code
          name
        }
      }
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
