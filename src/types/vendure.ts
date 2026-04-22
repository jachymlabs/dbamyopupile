/**
 * Vendure GraphQL response types for the storefront.
 * Replaces `any` casts throughout the codebase.
 */

export interface VendureAsset {
    id: string;
    preview: string;
    source?: string;
}

export interface VendureCollection {
    id: string;
    name: string;
    slug: string;
    description?: string;
    featuredAsset?: VendureAsset;
    parent?: { id: string; name?: string };
}

export interface VendureVariant {
    id: string;
    name: string;
    sku: string;
    priceWithTax: number;
    stockLevel: string;
    options?: Array<{
        id: string;
        code: string;
        name: string;
        group: { id: string; code: string; name: string };
    }>;
    customFields?: {
        lowestPrice30d?: number;
        [key: string]: unknown;
    };
}

export interface VendureProduct {
    id: string;
    name: string;
    slug: string;
    description: string;
    featuredAsset?: VendureAsset;
    assets: VendureAsset[];
    variants: VendureVariant[];
    collections?: VendureCollection[];
    customFields?: {
        shortDescription?: string;
        [key: string]: unknown;
    };
}

export interface VendureOrderLine {
    id: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    productVariant: {
        id: string;
        name: string;
        sku?: string;
        product: {
            id: string;
            name: string;
            slug: string;
            featuredAsset?: VendureAsset;
        };
    };
}

export interface VendureDiscount {
    description: string;
    amountWithTax: number;
}

export interface VendureShippingLine {
    shippingMethod: {
        id: string;
        name: string;
    };
    priceWithTax: number;
}

export interface VendurePayment {
    id: string;
    method: string;
    amount: number;
    state: string;
    metadata?: Record<string, unknown>;
}

export interface VendureOrder {
    id: string;
    code: string;
    state: string;
    totalQuantity: number;
    subTotal?: number;
    subTotalWithTax: number;
    shipping?: number;
    shippingWithTax: number;
    total?: number;
    totalWithTax: number;
    currencyCode: string;
    couponCodes: string[];
    discounts: VendureDiscount[];
    lines: VendureOrderLine[];
    shippingLines?: VendureShippingLine[];
    payments?: VendurePayment[];
    customer?: {
        id: string;
        firstName: string;
        lastName: string;
        emailAddress: string;
        phoneNumber?: string;
    };
    shippingAddress?: {
        fullName: string;
        streetLine1: string;
        city: string;
        postalCode: string;
        country: string;
        phoneNumber?: string;
    };
}

export interface VendureSearchResult {
    productId: string;
    productName: string;
    slug: string;
    priceWithTax: { min: number; max: number } | { value: number };
    productAsset?: VendureAsset;
}
