/**
 * Static word and domain lists for the detectors. Lowercase. Phrases are matched
 * against normalised page text (lowercase, collapsed whitespace).
 */

/** TLDs with a high share of abuse (Spamhaus / Interisle reports). Weak signal on its own. */
export const RISKY_TLDS = new Set([
  'zip', 'mov', 'top', 'xyz', 'icu', 'click', 'cfd', 'sbs', 'rest', 'buzz', 'bond', 'cyou', 'monster',
  'quest', 'lol', 'mom', 'beauty', 'hair', 'skin', 'makeup', 'autos', 'boats', 'yachts', 'motorcycles',
  'loan', 'win', 'bid', 'gq', 'cf', 'ml', 'ga', 'tk', 'pw', 'cc', 'su', 'live', 'online', 'site', 'website',
  'store', 'shop', 'support', 'help', 'vip', 'work', 'rest', 'fit', 'today', 'life', 'world', 'info', 'cam', 'fun',
]);

/**
 * Free hosting and form builders scammers use because their domains can't be
 * blocked wholesale. Registrable domains (or host suffixes for multi-label ones).
 */
export const TRUSTED_HOST_ABUSE = [
  'sites.google.com', 'docs.google.com', 'forms.gle', 'drive.google.com', 'storage.googleapis.com',
  'firebaseapp.com', 'web.app', 'appspot.com', 'blogspot.com', 'notion.site', 'weebly.com', 'wixsite.com',
  'square.site', 'webflow.io', 'framer.app', 'carrd.co', 'godaddysites.com', 'pages.dev', 'workers.dev',
  'vercel.app', 'netlify.app', 'github.io', 'gitbook.io', 'glitch.me', 'replit.app', 'repl.co', 'ngrok.io',
  'ngrok-free.app', 'trycloudflare.com', '000webhostapp.com', 'r2.dev', 'ipfs.io', 'dweb.link', 'typedream.app',
  'jotform.com', 'formstack.com', 'surveymonkey.com', 'canva.site', 'my.canva.site', 'wordpress.com', 'herokuapp.com',
  // User content and cloud storage under big-company names.
  'googleusercontent.com', 'amazonaws.com', 'azurewebsites.net', 'blob.core.windows.net', 'appdomain.cloud',
  'amplifyapp.com', 'ondigitalocean.app', 'digitaloceanspaces.com', 'myqcloud.com', 'filesusr.com', 'app.link', 'page.link',
  // Dynamic DNS and cheap site builders.
  'duckdns.org', 'ddns.net', 'sytes.net', 'hopto.org', 'plesk.page', 'pantheonsite.io', 'yolasite.com', 'mybluehost.me',
  'mystrikingly.com', 'teachable.com', 'tw1.ru', 'tmweb.ru', 'beget.tech', 'eu.org', 'sa.com', 'ru.com',
];

export const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'rb.gy', 'cutt.ly', 'shorturl.at', 'tiny.cc',
  'rebrand.ly', 'bl.ink', 'short.io', 's.id', 'v.gd', 'qrco.de', 't.ly',
]);

/** Phrase families. Each hit adds a little; several families together add a lot. */
export const PHRASES = {
  urgency: [
    'act now', 'immediately', 'within 24 hours', 'within 12 hours', 'within 48 hours', 'final notice', 'last warning',
    'account will be suspended', 'account has been suspended', 'account has been locked', 'account is locked',
    'account will be closed', 'unusual activity', 'suspicious activity', 'unauthorized login', 'verify your identity',
    'verify your account', 'confirm your identity', 'update your payment', 'payment declined', 'failed delivery',
    'package is on hold', 'could not be delivered', 'redelivery fee', 'unpaid toll', 'toll balance', 'avoid late fee',
    'limited time', 'expires today', 'only a few left', 'your session has expired', 'action required',
  ],
  scareware: [
    'your computer is infected', 'your pc is infected', 'virus detected', 'viruses detected', 'malware detected',
    'trojan', 'spyware detected', 'your computer has been blocked', 'your computer is locked', 'access to this pc has been blocked',
    'windows defender alert', 'windows security alert', 'microsoft support', 'call microsoft', 'apple support alert',
    'do not restart', 'do not shut down', 'do not close this window', 'your data is at risk', 'call the toll free',
    'call support immediately', 'contact technician', 'error code 0x', 'firewall warning', 'hard drive will be deleted',
    'identity theft risk', 'pornographic spyware', 'call now', 'technical support',
  ],
  investment: [
    'guaranteed returns', 'guaranteed profit', 'risk free', 'risk-free investment', 'daily profit', 'daily returns',
    'per day profit', 'double your', 'passive income', 'withdraw anytime', 'minimum deposit', 'vip level',
    'mining pool', 'liquidity mining', 'ai trading bot', 'arbitrage bot', 'copy trading', 'profit has been credited',
    'your earnings', 'deposit to unlock', 'pay the tax to withdraw', 'withdrawal fee', 'trusted by millions of investors',
  ],
  giftCard: [
    'gift card', 'google play card', 'itunes card', 'apple gift card', 'steam card', 'scratch the back',
    'send the card number', 'send a photo of the card', 'bitcoin atm', 'crypto atm', 'wire transfer only',
    'western union', 'moneygram', 'pay with zelle only', 'zelle only', 'crypto only', 'payment via bitcoin only',
  ],
  prize: [
    'you have won', "you've won", 'congratulations you', 'claim your prize', 'claim your reward', 'selected winner',
    'free iphone', 'lucky visitor', 'spin the wheel', 'only pay shipping', 'just pay shipping',
  ],
  credentials: [
    'sign in', 'log in', 'login', 'enter your password', 'verify your password', 'confirm your password',
    'social security number', 'mother\'s maiden name', 'card verification', 'cvv', 'online banking',
  ],
  clickFix: [
    'verify you are human', 'i am not a robot', "i'm not a robot", 'press windows + r', 'windows key + r', 'win + r',
    'press win+r', 'windows+r', 'ctrl + v', 'ctrl+v', 'press enter', 'verification steps', 'paste the code',
    'open the run dialog', 'press and hold the windows key', 'cmd + space', 'open terminal',
    'click allow to', 'press allow to', 'click allow if you are not a robot',
  ],
  seedPhrase: [
    'recovery phrase', 'seed phrase', 'secret phrase', 'mnemonic phrase', '12-word', '24-word', '12 word', '24 word',
    'private key', 'import wallet', 'validate wallet', 'synchronize wallet', 'rectify wallet', 'wallet validation',
  ],
} satisfies Record<string, string[]>;

export type PhraseFamily = keyof typeof PHRASES;

/** Remote-access tools that tech-support scammers ask victims to install. */
export const REMOTE_ACCESS_TOOLS = [
  'anydesk', 'teamviewer', 'screenconnect', 'connectwise', 'logmein', 'gotoassist', 'goto resolve', 'ultraviewer',
  'supremo', 'rustdesk', 'splashtop', 'zoho assist', 'remotepc', 'aeroadmin', 'ammyy', 'quickassist', 'bomgar',
  'beyondtrust', 'atera', 'action1', 'netsupport', 'remoteutilities', 'dwservice', 'ultravnc', 'tightvnc', 'realvnc',
];

/** File extensions that run code. */
export const EXECUTABLE_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'appx', 'scr', 'bat', 'cmd', 'com', 'pif', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1',
  'hta', 'cpl', 'jar', 'lnk', 'reg', 'dmg', 'pkg', 'app', 'command', 'sh', 'apk', 'xapk', 'iso', 'img', 'vhd', 'msc',
  'application', 'appref-ms', 'url', 'library-ms', 'one', 'xll',
]);

/** Archives often used to smuggle executables past checks. */
export const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'cab', 'ace']);
