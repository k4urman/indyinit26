import type { Reason } from '../shared/contract';
import type { Brand } from '../data/brands';

/**
 * Every explanation the engine can give. Plain words, grade-6 reading level,
 * no "phishing", "domain", "SSL". The UI renders these verbatim.
 */
const kindWord: Record<Brand['kind'], string> = {
  bank: 'bank', payment: 'payment service', tech: 'company', delivery: 'delivery service', government: 'government agency',
  shop: 'store', crypto: 'crypto service', social: 'company', telecom: 'phone company',
};

export const R = {
  knownBad: (): Reason => ({
    kind: 'knownBad',
    title: 'This website is a known scam',
    detail: 'It is on a public list of websites that steal money or passwords.',
  }),
  userBlocklist: (): Reason => ({
    kind: 'userBlocklist',
    title: 'You blocked this website',
    detail: 'You or someone in your family added it to the block list.',
  }),
  lookalike: (b: Brand, domain: string): Reason => ({
    kind: 'lookalikeDomain',
    title: `This is not ${b.name}'s website`,
    detail: `The web address "${domain}" is made to look like ${b.domains[0]}, but it is a different website.`,
  }),
  combosquat: (b: Brand, domain: string): Reason => ({
    kind: 'lookalikeDomain',
    title: `This is probably not ${b.name}`,
    detail: `The web address uses the name "${b.name}", but ${b.name}'s real website is ${b.domains[0]}, not ${domain}.`,
  }),
  impersonation: (b: Brand, domain: string): Reason => ({
    kind: 'impersonation',
    title: `This page pretends to be ${b.name}`,
    detail: `It shows ${b.name}'s name, but it is on ${domain}. The real ${kindWord[b.kind]} is at ${b.domains[0]}.`,
  }),
  trustedHost: (host: string): Reason => ({
    kind: 'domainTrust',
    title: 'Anyone can make a page like this',
    detail: `This page is on ${host}, a free website builder. Real banks and companies don't ask you to sign in there.`,
  }),
  ip: (): Reason => ({
    kind: 'domainTrust',
    title: 'This website has no proper name',
    detail: 'Its address is only numbers. Real companies use a name like example.com.',
  }),
  idn: (): Reason => ({
    kind: 'domainTrust',
    title: 'The address uses look-alike letters',
    detail: 'Some letters in the web address come from other alphabets so it looks like a site you know.',
  }),
  riskyTld: (suffix: string): Reason => ({
    kind: 'domainTrust',
    title: 'Unusual web address ending',
    detail: `Addresses ending in ".${suffix}" are cheap and often used for scams. That alone doesn't mean this site is bad.`,
  }),
  longAddress: (host: string): Reason => ({
    kind: 'domainTrust',
    title: 'The web address is oddly long',
    detail: `"${host}" has many parts. Scammers do this to hide the real website name.`,
  }),
  shortener: (): Reason => ({
    kind: 'domainTrust',
    title: "This short link hides where it goes",
    detail: 'Short links are fine from people you know. From a text or email, open the company\'s website yourself instead.',
  }),
  passwordOffsite: (host: string): Reason => ({
    kind: 'pageIntent',
    title: 'Your password would go to another website',
    detail: `The sign-in form sends what you type to ${host}, not to this website.`,
  }),
  asksPassword: (): Reason => ({
    kind: 'pageIntent',
    title: 'It asks for your password',
    detail: 'Only type your password on a website you opened yourself, not from a link in a text or email.',
  }),
  asksCard: (): Reason => ({
    kind: 'pageIntent',
    title: 'It asks for your card details',
    detail: 'Check that you know and trust this store before paying.',
  }),
  smallFee: (b: Brand | null): Reason => ({
    kind: 'pageIntent',
    title: 'Small fee to release a package or pay a toll',
    detail: `${b ? b.name : 'Delivery companies and toll agencies'} never ask for a small fee by card on a website like this. This is a very common scam.`,
  }),
  asksSeed: (): Reason => ({
    kind: 'pageIntent',
    title: 'It asks for your wallet recovery phrase',
    detail: 'Anyone with these words can take everything in your wallet. No real company will ever ask for them.',
  }),
  asksBank: (): Reason => ({
    kind: 'pageIntent',
    title: 'It asks for your bank account details',
    detail: 'Only give these to a company you already know and trust.',
  }),
  asksSsn: (): Reason => ({
    kind: 'pageIntent',
    title: 'It asks for your Social Security number',
    detail: 'Scammers use it to open accounts in your name.',
  }),
  pressure: (): Reason => ({
    kind: 'pressure',
    title: 'It is trying to rush or scare you',
    detail: 'It says things like "your account is locked" or "act now". Scammers rush people so they don\'t stop to think.',
  }),
  investment: (): Reason => ({
    kind: 'pressure',
    title: 'It promises money that sounds too good to be true',
    detail: 'Real investments never guarantee profits. Check the company at brokercheck.finra.org before sending money.',
  }),
  giftCard: (): Reason => ({
    kind: 'pressure',
    title: 'It asks for gift cards, wire transfers or crypto',
    detail: 'Real companies and government agencies never ask to be paid this way. Once sent, the money is gone.',
  }),
  prize: (): Reason => ({
    kind: 'pressure',
    title: "It says you've won something",
    detail: 'You can\'t win a prize you didn\'t enter. These pages want your card details or personal information.',
  }),
  fakeShop: (): Reason => ({
    kind: 'pressure',
    title: 'Prices are far too low',
    detail: 'Huge discounts on popular brands with unusual ways to pay are a sign of a fake store.',
  }),
  scareware: (): Reason => ({
    kind: 'hostileBehavior',
    title: 'This is a fake virus warning',
    detail: 'Your computer is fine. Microsoft and Apple never show phone numbers in warnings. Do not call the number.',
  }),
  lockedScreen: (): Reason => ({
    kind: 'hostileBehavior',
    title: 'It tried to take over your screen',
    detail: 'It went full screen, played sounds or kept popping up messages so you feel trapped. We stopped it.',
  }),
  clickFix: (): Reason => ({
    kind: 'hostileBehavior',
    title: 'This is a fake "prove you are human" check',
    detail: 'It tried to copy a hidden command so you would paste and run it. That gives scammers control of your computer. We replaced it with a harmless note.',
  }),
  wallet: (): Reason => ({
    kind: 'hostileBehavior',
    title: 'It wants to connect to your crypto wallet',
    detail: 'Connecting lets a website ask to move your money. Only connect to sites you know well.',
  }),
  remoteAccess: (tool: string): Reason => ({
    kind: 'download',
    title: 'Did someone on the phone tell you to install this?',
    detail: `${tool} lets another person control your computer. Scammers ask for it to steal from your bank account.`,
  }),
  executable: (file: string): Reason => ({
    kind: 'download',
    title: 'This file can change your computer',
    detail: `"${file}" is a program. Only install programs from websites you trust.`,
  }),
  unfamiliar: (domain: string): Reason => ({
    kind: 'domainTrust',
    title: "You haven't used this website before",
    detail: `Your protection level asks before sharing money or personal details with new websites like ${domain}.`,
  }),
  piiTyped: (what: string): Reason => ({
    kind: 'personalInfo',
    title: `You are typing your ${what}`,
    detail: 'This website looks risky. Make sure you really mean to share this here.',
  }),
  upload: (): Reason => ({
    kind: 'upload',
    title: 'You are about to send a file',
    detail: 'This website looks risky. Photos of IDs, bank statements and documents can be used to steal your identity.',
  }),
};
