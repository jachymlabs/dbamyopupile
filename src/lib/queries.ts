// Plain string GraphQL queries — adapted from Next.js reference (gql.tada → plain strings)
import { ORDER_FRAGMENT } from './fragments';

export const GET_STORE_CONFIG = /* GraphQL */ `
  query GetStoreConfig {
    activeChannel {
      id
      code
      customFields {
        storeName
        storeTagline
        contactEmail
        contactPhone
        freeShippingThreshold
        promoBarText
        promoBarLink
        companyName
        companyNip
        companyAddress
        returnAddress
        inpostGeowidgetToken
        metaPixelId
        metaDatasetId
      }
    }
  }
`;

export const GET_COLLECTIONS = /* GraphQL */ `
  query GetCollections {
    collections(options: { filter: { parentId: { eq: "1" } } }) {
      items {
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

export const SEARCH_PRODUCTS = /* GraphQL */ `
  query SearchProducts($input: SearchInput!) {
    search(input: $input) {
      totalItems
      items {
        productId
        productName
        slug
        productAsset {
          id
          preview
        }
        priceWithTax {
          __typename
          ... on PriceRange {
            min
            max
          }
          ... on SinglePrice {
            value
          }
        }
        currencyCode
      }
      facetValues {
        count
        facetValue {
          id
          name
          facet {
            id
            name
          }
        }
      }
    }
  }
`;

export const GET_PRODUCT_DETAIL = /* GraphQL */ `
  query GetProductDetail($slug: String!) {
    product(slug: $slug) {
      id
      name
      description
      slug
      customFields {
        shortDescription
      }
      featuredAsset {
        id
        preview
      }
      assets {
        id
        preview
        source
      }
      variants {
        id
        name
        sku
        priceWithTax
        stockLevel
        customFields {
          lowestPrice30d
        }
        options {
          id
          code
          name
          groupId
          group {
            id
            code
            name
          }
        }
      }
      optionGroups {
        id
        code
        name
        options {
          id
          code
          name
        }
      }
      collections {
        id
        name
        slug
        parent {
          id
        }
      }
    }
  }
`;

export const GET_ACTIVE_ORDER = `
  query GetActiveOrder {
    activeOrder {
      ${ORDER_FRAGMENT}
      subTotal
      shipping
      total
    }
  }
`;

export const GET_ELIGIBLE_SHIPPING_METHODS = /* GraphQL */ `
  query GetEligibleShippingMethods {
    eligibleShippingMethods {
      id
      name
      code
      description
      price
      priceWithTax
    }
  }
`;

export const GET_ELIGIBLE_PAYMENT_METHODS = /* GraphQL */ `
  query GetEligiblePaymentMethods {
    eligiblePaymentMethods {
      id
      name
      code
      description
      isEligible
      eligibilityMessage
    }
  }
`;

export const GET_COLLECTION = /* GraphQL */ `
  query GetCollection($slug: String!) {
    collection(slug: $slug) {
      id
      name
      slug
      description
      featuredAsset {
        id
        preview
      }
      parent {
        id
        name
        slug
      }
    }
  }
`;

export const GET_ORDER_BY_CODE = /* GraphQL */ `
  query GetOrderByCode($code: String!) {
    orderByCode(code: $code) {
      id
      code
      state
      createdAt
      totalQuantity
      subTotalWithTax
      shippingWithTax
      totalWithTax
      currencyCode
      customer {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
      }
      shippingAddress {
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        country
        phoneNumber
      }
      shippingLines {
        shippingMethod {
          id
          name
        }
        priceWithTax
      }
      lines {
        id
        productVariant {
          id
          name
          sku
          productId
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
        unitPriceWithTax
        quantity
        linePriceWithTax
      }
      discounts {
        description
        amountWithTax
      }
    }
  }
`;
