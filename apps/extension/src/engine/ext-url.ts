import { browser } from 'wxt/browser';

/**
 * runtime.getURL without WXT's public-path typing, which only knows files that
 * exist at type-generation time (blocked.html is built by the frontend).
 */
export function extUrl(path: string): string {
  return (browser.runtime.getURL as (p: string) => string)(path);
}
