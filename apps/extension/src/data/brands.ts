/**
 * Brands scammers impersonate most, and the registrable domains they really use.
 * `names` are matched as whole words in titles, headings, logos and hostnames.
 * `kind` tailors explanations ("your bank", "the delivery company").
 */
export type BrandKind = 'bank' | 'tech' | 'delivery' | 'government' | 'shop' | 'payment' | 'crypto' | 'social' | 'telecom';

export interface Brand {
  name: string; // display name
  names: string[]; // lowercase match terms; first is used for hostname checks
  domains: string[]; // official registrable domains; the first is the safe alternative
  kind: BrandKind;
}

export const BRANDS: Brand[] = [
  // Banks and payments
  { name: 'Chase', names: ['chase', 'jpmorgan'], domains: ['chase.com', 'jpmorganchase.com', 'jpmorgan.com'], kind: 'bank' },
  { name: 'Bank of America', names: ['bankofamerica', 'bank of america', 'bofa'], domains: ['bankofamerica.com', 'bofa.com'], kind: 'bank' },
  { name: 'Wells Fargo', names: ['wellsfargo', 'wells fargo'], domains: ['wellsfargo.com', 'wf.com'], kind: 'bank' },
  { name: 'Citi', names: ['citibank', 'citi'], domains: ['citi.com', 'citibank.com', 'citigroup.com'], kind: 'bank' },
  { name: 'Capital One', names: ['capitalone', 'capital one'], domains: ['capitalone.com'], kind: 'bank' },
  { name: 'US Bank', names: ['usbank', 'u.s. bank', 'us bank'], domains: ['usbank.com'], kind: 'bank' },
  { name: 'PNC', names: ['pnc'], domains: ['pnc.com'], kind: 'bank' },
  { name: 'Navy Federal', names: ['navyfederal', 'navy federal'], domains: ['navyfederal.org'], kind: 'bank' },
  { name: 'American Express', names: ['americanexpress', 'american express', 'amex'], domains: ['americanexpress.com', 'aexp.com'], kind: 'bank' },
  { name: 'PayPal', names: ['paypal'], domains: ['paypal.com', 'paypal.me', 'paypalobjects.com'], kind: 'payment' },
  { name: 'Venmo', names: ['venmo'], domains: ['venmo.com'], kind: 'payment' },
  { name: 'Zelle', names: ['zelle', 'zellepay'], domains: ['zellepay.com', 'zelle.com'], kind: 'payment' },
  { name: 'Cash App', names: ['cashapp', 'cash app'], domains: ['cash.app', 'cash.me', 'squareup.com', 'block.xyz'], kind: 'payment' },
  { name: 'Visa', names: ['visa'], domains: ['visa.com'], kind: 'payment' },
  { name: 'Mastercard', names: ['mastercard'], domains: ['mastercard.com', 'mastercard.us'], kind: 'payment' },
  // Tech
  { name: 'Microsoft', names: ['microsoft', 'outlook', 'office365', 'office 365', 'onedrive', 'hotmail'], domains: ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com', 'microsoftonline-p.com', 'outlook.com', 'office365.com', 'hotmail.com', 'onedrive.com', 'sharepoint.com', 'windows.com', 'bing.com', 'msn.com', 'azure.com', 'skype.com', 'xbox.com'], kind: 'tech' },
  { name: 'Apple', names: ['apple', 'icloud', 'itunes', 'apple id'], domains: ['apple.com', 'icloud.com', 'itunes.com', 'me.com'], kind: 'tech' },
  { name: 'Google', names: ['google', 'gmail'], domains: ['google.com', 'gmail.com', 'youtube.com', 'gstatic.com', 'googleapis.com', 'withgoogle.com', 'android.com', 'chrome.com'], kind: 'tech' },
  { name: 'Netflix', names: ['netflix'], domains: ['netflix.com'], kind: 'tech' },
  { name: 'Adobe', names: ['adobe'], domains: ['adobe.com', 'adobelogin.com'], kind: 'tech' },
  { name: 'Dropbox', names: ['dropbox'], domains: ['dropbox.com'], kind: 'tech' },
  { name: 'DocuSign', names: ['docusign'], domains: ['docusign.com', 'docusign.net'], kind: 'tech' },
  { name: 'Norton', names: ['norton'], domains: ['norton.com', 'nortonlifelock.com', 'gen.digital'], kind: 'tech' },
  { name: 'McAfee', names: ['mcafee'], domains: ['mcafee.com'], kind: 'tech' },
  { name: 'Geek Squad', names: ['geeksquad', 'geek squad'], domains: ['bestbuy.com', 'geeksquad.com'], kind: 'tech' },
  // Social / telecom
  { name: 'Facebook', names: ['facebook', 'meta'], domains: ['facebook.com', 'fb.com', 'meta.com', 'messenger.com', 'fbcdn.net'], kind: 'social' },
  { name: 'Instagram', names: ['instagram'], domains: ['instagram.com', 'cdninstagram.com'], kind: 'social' },
  { name: 'WhatsApp', names: ['whatsapp'], domains: ['whatsapp.com', 'whatsapp.net', 'wa.me'], kind: 'social' },
  { name: 'LinkedIn', names: ['linkedin'], domains: ['linkedin.com', 'licdn.com'], kind: 'social' },
  { name: 'AT&T', names: ['att', 'at&t'], domains: ['att.com', 'att.net'], kind: 'telecom' },
  { name: 'Verizon', names: ['verizon'], domains: ['verizon.com', 'verizonwireless.com'], kind: 'telecom' },
  { name: 'T-Mobile', names: ['tmobile', 't-mobile'], domains: ['t-mobile.com'], kind: 'telecom' },
  // Delivery and tolls
  { name: 'USPS', names: ['usps', 'postal service', 'us postal'], domains: ['usps.com', 'usps.gov'], kind: 'delivery' },
  { name: 'UPS', names: ['ups'], domains: ['ups.com'], kind: 'delivery' },
  { name: 'FedEx', names: ['fedex'], domains: ['fedex.com'], kind: 'delivery' },
  { name: 'DHL', names: ['dhl'], domains: ['dhl.com', 'dhl.de'], kind: 'delivery' },
  { name: 'E-ZPass', names: ['ezpass', 'e-zpass'], domains: ['e-zpassny.com', 'ezpassnj.com', 'ezpassva.com', 'ezpassma.com', 'e-zpassiag.com', 'ezpassmd.com', 'paytollnj.com'], kind: 'delivery' },
  // Shops
  { name: 'Amazon', names: ['amazon'], domains: ['amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'amazon.in', 'amazon.dev', 'a2z.com'], kind: 'shop' },
  { name: 'Walmart', names: ['walmart'], domains: ['walmart.com'], kind: 'shop' },
  { name: 'Costco', names: ['costco'], domains: ['costco.com'], kind: 'shop' },
  { name: 'Target', names: ['target'], domains: ['target.com'], kind: 'shop' },
  { name: 'Best Buy', names: ['bestbuy', 'best buy'], domains: ['bestbuy.com'], kind: 'shop' },
  { name: 'eBay', names: ['ebay'], domains: ['ebay.com'], kind: 'shop' },
  // Government
  { name: 'IRS', names: ['irs', 'internal revenue service'], domains: ['irs.gov'], kind: 'government' },
  { name: 'Social Security', names: ['social security administration', 'ssa'], domains: ['ssa.gov'], kind: 'government' },
  { name: 'Medicare', names: ['medicare'], domains: ['medicare.gov', 'cms.gov'], kind: 'government' },
  { name: 'DMV', names: ['dmv'], domains: ['dmv.ca.gov', 'dmv.ny.gov', 'dmv.org'], kind: 'government' },
  // Crypto
  { name: 'Coinbase', names: ['coinbase'], domains: ['coinbase.com'], kind: 'crypto' },
  { name: 'Binance', names: ['binance'], domains: ['binance.com', 'binance.us'], kind: 'crypto' },
  { name: 'Kraken', names: ['kraken'], domains: ['kraken.com'], kind: 'crypto' },
  { name: 'MetaMask', names: ['metamask'], domains: ['metamask.io'], kind: 'crypto' },
  { name: 'Trust Wallet', names: ['trustwallet', 'trust wallet'], domains: ['trustwallet.com'], kind: 'crypto' },
];

/** Short brand terms that are also common words; only matched in hostnames, never in page text. */
export const HOSTNAME_ONLY_TERMS = new Set(['icloud', 'norton', 'chase', 'target', 'apple', 'citi', 'ups', 'visa', 'meta', 'att', 'ssa', 'dmv', 'pnc', 'irs']);

const OFFICIAL = new Map<string, Brand>();
for (const b of BRANDS) for (const d of b.domains) OFFICIAL.set(d, b);

/** The brand that owns this registrable domain, if any. */
export function brandOfDomain(domain: string): Brand | undefined {
  return OFFICIAL.get(domain);
}
