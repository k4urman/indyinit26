# URL-only detection (known-scam list off)

Generated 2026-11-07 by `eval/url-only.ts`. Each cell is the share of URLs whose
**web address alone** reaches the warning threshold at that protection level. For scam sets higher is
better; for ordinary sites lower is better. Page signals are not included, so for scams this is a
lower bound. In normal use the bundled list catches the listed ones outright; this measures brand-new ones.

| Set | URLs | Chill (≥70) | Balanced (≥50) | Strict (≥35) | Paranoid (≥20) | Any warning sign |
|---|---|---|---|---|---|---|
| OpenPhish community feed (live phishing URLs) | 300 | 0.0% | 0.0% | 0.0% | 6.3% | 18.7% |
| Phishing.Database, random 5,000 hosts | 5000 | 0.0% | 0.0% | 0.2% | 8.2% | 26.0% |
| Popular sites, Tranco #1–500 (trusted list applies) | 500 | 0.0% | 0.0% | 0.0% | 0.0% | 1.2% |
| Ordinary sites, Tranco #10,001–15,000 (no trusted credit) | 5000 | 0.0% | 0.0% | 0.1% | 0.3% | 3.2% |

"Any warning sign" = at least one reason was found (e.g. look-alike name, free website builder,
unusual ending), even if below the warning threshold.

## Brand impersonation in the address

Of the addresses that contain a big brand's name (e.g. `paypal-cancel.cc`, `amazon.co.jp.qs1a.xyz`),
how many the engine names as "not that brand's website". For ordinary sites this is the false-alarm side.

| Set | Addresses using a brand name | Identified as not that brand |
|---|---|---|
| OpenPhish community feed (live phishing URLs) | 21 | 90.5% |
| Phishing.Database, random 5,000 hosts | 283 | 83.7% |
| Popular sites, Tranco #1–500 (trusted list applies) | 54 | 0.0% |
| Ordinary sites, Tranco #10,001–15,000 (no trusted credit) | 119 | 10.9% |

Examples caught from the address alone:

- `cuinbase.com` → 40: This is not Coinbase's website
- `amazon.co.jp.xcvvbntytrunvbdfg15gfgvb.icu` → 38: This is probably not Amazon; Unusual web address ending; The web address is oddly long
- `metamask.lt` → 40: This is not MetaMask's website
- `amazon.co.jp.qs1a.xyz` → 38: This is probably not Amazon; Unusual web address ending; The web address is oddly long
- `hnzayk.2dspsebim4.pay.paypalcancel.cc` → 38: This is probably not PayPal; Unusual web address ending; The web address is oddly long
- `amazon.account-update.amazon.co.jp.amzaonuins-sdufd13dany.monster` → 38: This is probably not Amazon; Unusual web address ending; The web address is oddly long
- `m.facabook.vn` → 40: This is not Facebook's website
- `neflix.me` → 40: This is not Netflix's website
