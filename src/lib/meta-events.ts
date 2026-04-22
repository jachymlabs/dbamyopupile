/**
 * Browser-side Meta Pixel event helper.
 * Only fires if fbq is loaded (which requires cookie consent).
 */
declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

export function trackEvent(eventName: string, params?: Record<string, any>, eventId?: string) {
  if (typeof window !== 'undefined' && typeof window.fbq !== 'undefined') {
    if (eventId) {
      window.fbq('track', eventName, params, { eventID: eventId });
    } else {
      window.fbq('track', eventName, params);
    }
  }
}
