// Plain string GraphQL mutations — adapted from Next.js reference
import { ORDER_FRAGMENT } from './fragments';

export const ADD_TO_CART = `
  mutation AddToCart($variantId: ID!, $quantity: Int!) {
    addItemToOrder(productVariantId: $variantId, quantity: $quantity) {
      __typename
      ... on Order { ${ORDER_FRAGMENT} }
      ... on ErrorResult { errorCode message }
    }
  }
`;

export const ADJUST_CART_ITEM = `
  mutation AdjustCartItem($lineId: ID!, $quantity: Int!) {
    adjustOrderLine(orderLineId: $lineId, quantity: $quantity) {
      __typename
      ... on Order { ${ORDER_FRAGMENT} }
      ... on ErrorResult { errorCode message }
    }
  }
`;

export const REMOVE_FROM_CART = `
  mutation RemoveFromCart($lineId: ID!) {
    removeOrderLine(orderLineId: $lineId) {
      __typename
      ... on Order { ${ORDER_FRAGMENT} }
      ... on ErrorResult { errorCode message }
    }
  }
`;

export const SET_CUSTOMER_FOR_ORDER = /* GraphQL */ `
  mutation SetCustomerForOrder($input: CreateCustomerInput!) {
    setCustomerForOrder(input: $input) {
      __typename
      ... on Order {
        id
        code
        customer {
          id
          firstName
          lastName
          emailAddress
          phoneNumber
        }
      }
      ... on AlreadyLoggedInError { errorCode message }
      ... on EmailAddressConflictError { errorCode message }
      ... on GuestCheckoutError { errorCode message }
      ... on NoActiveOrderError { errorCode message }
    }
  }
`;

export const SET_ORDER_SHIPPING_ADDRESS = /* GraphQL */ `
  mutation SetOrderShippingAddress($input: CreateAddressInput!) {
    setOrderShippingAddress(input: $input) {
      __typename
      ... on Order {
        id
        code
        shippingAddress {
          fullName
          streetLine1
          city
          postalCode
          country
          phoneNumber
        }
      }
      ... on ErrorResult { errorCode message }
    }
  }
`;

export const SET_ORDER_SHIPPING_METHOD = /* GraphQL */ `
  mutation SetOrderShippingMethod($shippingMethodId: [ID!]!) {
    setOrderShippingMethod(shippingMethodId: $shippingMethodId) {
      __typename
      ... on Order {
        id
        code
        shippingWithTax
        totalWithTax
        shippingLines {
          shippingMethod { id name }
          priceWithTax
        }
      }
      ... on ErrorResult { errorCode message }
    }
  }
`;

export const TRANSITION_ORDER_TO_STATE = /* GraphQL */ `
  mutation TransitionOrderToState($state: String!) {
    transitionOrderToState(state: $state) {
      __typename
      ... on Order { id code state }
      ... on OrderStateTransitionError { errorCode message transitionError fromState toState }
    }
  }
`;

export const ADD_PAYMENT_TO_ORDER = /* GraphQL */ `
  mutation AddPaymentToOrder($input: PaymentInput!) {
    addPaymentToOrder(input: $input) {
      __typename
      ... on Order {
        id
        code
        state
        totalWithTax
        totalQuantity
        payments { id method amount state metadata }
      }
      ... on ErrorResult { errorCode message }
    }
  }
`;

export const APPLY_COUPON_CODE = `
  mutation ApplyCouponCode($couponCode: String!) {
    applyCouponCode(couponCode: $couponCode) {
      __typename
      ... on Order { ${ORDER_FRAGMENT} }
      ... on CouponCodeExpiredError { errorCode message }
      ... on CouponCodeInvalidError { errorCode message }
      ... on CouponCodeLimitError { errorCode message }
    }
  }
`;

export const SET_ORDER_CUSTOM_FIELDS = /* GraphQL */ `
  mutation SetOrderCustomFields($input: UpdateOrderInput!) {
    setOrderCustomFields(input: $input) {
      __typename
      ... on Order { id }
      ... on ErrorResult { errorCode message }
    }
  }
`;

export const REMOVE_COUPON_CODE = `
  mutation RemoveCouponCode($couponCode: String!) {
    removeCouponCode(couponCode: $couponCode) {
      __typename
      ... on Order { ${ORDER_FRAGMENT} }
    }
  }
`;
