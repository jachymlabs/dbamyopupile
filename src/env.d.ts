/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly VENDURE_API_URL: string;
  readonly VENDURE_CHANNEL_TOKEN: string;
  readonly META_CAPI_ACCESS_TOKEN: string;  // fallback — docelowo z Channel custom fields
  readonly META_DATASET_ID: string;         // fallback — docelowo z Channel custom fields
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_INPOST_GEOWIDGET_TOKEN: string;
  readonly DATABASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
