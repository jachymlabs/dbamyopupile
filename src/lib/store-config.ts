import { shopApi } from './vendure';
import { GET_STORE_CONFIG } from './queries';

export interface StoreConfig {
  storeName: string;
  storeTagline: string;
  contactEmail: string;
  contactPhone: string | null;
  freeShippingThreshold: number;
  promoBarText: string | null;
  promoBarLink: string | null;
  companyName: string | null;
  companyNip: string | null;
  companyAddress: string | null;
  returnAddress: string | null;
  inpostGeowidgetToken: string | null;
  metaPixelId: string | null;
  metaDatasetId: string | null;
}

const DEFAULTS: StoreConfig = {
  storeName: 'Store',
  storeTagline: 'Sklep internetowy',
  contactEmail: 'kontakt@sklep.pl',
  contactPhone: null,
  freeShippingThreshold: 15000,
  promoBarText: null,
  promoBarLink: null,
  companyName: null,
  companyNip: null,
  companyAddress: null,
  returnAddress: null,
  inpostGeowidgetToken: null,
  metaPixelId: null,
  metaDatasetId: null,
};

let cached: StoreConfig | null = null;
let cachedAt = 0;
const CACHE_TTL = 60_000; // 60 seconds

export async function getStoreConfig(request?: Request): Promise<StoreConfig> {
  if (cached && Date.now() - cachedAt < CACHE_TTL) return cached;

  try {
    const data = await shopApi<any>(GET_STORE_CONFIG, {}, request);
    const cf = data.activeChannel?.customFields ?? {};
    cachedAt = Date.now();
    cached = {
      storeName: cf.storeName || DEFAULTS.storeName,
      storeTagline: cf.storeTagline || DEFAULTS.storeTagline,
      contactEmail: cf.contactEmail || DEFAULTS.contactEmail,
      contactPhone: cf.contactPhone || DEFAULTS.contactPhone,
      freeShippingThreshold: cf.freeShippingThreshold ?? DEFAULTS.freeShippingThreshold,
      promoBarText: cf.promoBarText || DEFAULTS.promoBarText,
      promoBarLink: cf.promoBarLink || DEFAULTS.promoBarLink,
      companyName: cf.companyName || DEFAULTS.companyName,
      companyNip: cf.companyNip || DEFAULTS.companyNip,
      companyAddress: cf.companyAddress || DEFAULTS.companyAddress,
      returnAddress: cf.returnAddress || DEFAULTS.returnAddress,
      inpostGeowidgetToken: cf.inpostGeowidgetToken || DEFAULTS.inpostGeowidgetToken,
      metaPixelId: cf.metaPixelId || DEFAULTS.metaPixelId,
      metaDatasetId: cf.metaDatasetId || DEFAULTS.metaDatasetId,
    };
    return cached;
  } catch (e: any) {
    if (import.meta.env.DEV) console.error('Failed to load store config:', e?.message);
    return DEFAULTS;
  }
}
