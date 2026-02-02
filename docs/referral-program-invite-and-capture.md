# Invite & Capture (Zaproszenia i nagrody)

## Overview

- **Program name**: Invite & Capture / Zaproszenia i nagrody
- **Goal**: Organic growth; referral cost &lt; 20% of added revenue
- **Scope**: Peer-to-peer referral program; separate from future Influencer/Ambassador programs

## Eligibility

- **Who can refer**: Users who have completed at least one **successful Stripe payment** (any type: gallery plan, plan upgrade, or wallet top-up). This excludes users who only used the welcome bonus (wallet-only) for their first gallery.
- **When the user gets their unique code and link**: After the **first successful Stripe payment** (gallery, upgrade, or wallet top-up). The eligibility email is sent from the payment webhook when we detect this is the user’s first PAID transaction that went through Stripe.
- **Free invitation gallery**: The first free gallery for new users is the welcome bonus (7 PLN wallet credit). Paying with wallet only does **not** count toward referrer eligibility; the user becomes eligible after their first Stripe payment (e.g. first top-up or first gallery paid via Stripe).

## User flows

1. **Referrer**: Find code/link in dashboard (sidebar “Zaproszenia i nagrody” or Settings → Moje kody rabatowe) → share link → earn rewards when referred users pay.
2. **Referred**: Sign up (optionally via invite link with `?ref=CODE`) → create gallery → at Publish, enter referrer’s code → get 10% or 15% off first gallery (eligible plans only).
3. **Using earned codes**: At Publish, paste earned code (e.g. `DISC-10P-...`) → discount applied; one code per purchase (Small/Medium, 1m/3m only).

## Rewards structure

| Milestone | Referrer reward | Referred discount |
|-----------|-----------------|--------------------|
| 1st referral | 10% code | 10% off first gallery (1 GB / 3 GB, 1m or 3m) |
| 3rd referral | Free Small gallery code (1 GB) | — |
| 10+ referrals | 20 PLN wallet top-up + Top Inviter badge | 15% off (1 GB / 3 GB, 1m or 3m) |

- **Eligible plans for all referral/earned discounts**: 1 GB and 3 GB, **1 or 3 months only**. Not valid on 12‑month plans or 10 GB plans.
- **Code expiry**: Earned codes expire in 6 months.

## Limitations

- Codes expire in 6 months.
- One code per purchase.
- Non-transferable (earned codes belong to the account that earned them).
- Cannot combine with other promotions unless allowed later.
- Statuses: Active / Used / Expired.

## Emails

- **Second email** (right after Welcome): Referral program info, Polish, no code; explains that the user will see their link in the dashboard after their first gallery purchase.
- **Eligibility email**: Sent when the user becomes eligible (after first successful Stripe payment: gallery, upgrade, or wallet top-up); includes their unique referral code and referral link.
- **Referrer reward email**: Sent after 1st / 3rd / 10th successful referral (e.g. “Otrzymałeś kod rabatowy 10%”).

## Dashboard

- **Sidebar block** (bottom of main app sidebar): Rules summary, referral link + copy, stats (Udane zaproszenia, Otrzymane bony), link to full page. No personal data or user IDs.
- **My Discount Codes** (Settings → Moje kody rabatowe): Full list of earned codes with type, expiry, status; copy code; full rules.
- **Publish wizard**: “Kod rabatowy” field; supports referral code (e.g. `PHOTO...`) or earned code (e.g. `DISC-...`). Backend returns Polish error messages for invalid/expired/wrong-account codes.

## KPIs

- Referral sign-up rate
- % of codes redeemed
- % of referred users who buy a second gallery
- Program cost vs added revenue
