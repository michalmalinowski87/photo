# Referral Program – Testing Guide

## Prerequisites

- Two test accounts: **referrer** (eligible: at least one successful Stripe payment—gallery, upgrade, or wallet top-up) and **referred** (new or no prior paid gallery).
- Test gallery for the referred user.
- Ability to trigger Welcome + second email (sign up new user).
- Stripe test mode or wallet-only path for payments.

## Eligibility and code generation

1. **New user signup** → No referral code yet; sidebar shows “Opłać pierwszą galerię, żeby otrzymać swój link.”
2. **After first successful Stripe payment** (gallery, upgrade, or wallet top-up) → User gets `referralCode` and referral link; eligibility email sent with code and link (from webhook).
3. **User who only used welcome bonus for first gallery** (wallet-only, no Stripe) → No referral code and no eligibility email until they complete at least one Stripe payment (e.g. first wallet top-up or first gallery paid via Stripe).

## Second email

- Sign up a new user → Verify Welcome email sent → Verify **second email** (referral program info, Polish, no code) sent immediately after.
- Content check: rules, eligible plans (1 GB and 3 GB, 1 or 3 months), “link in dashboard after first purchase”.

## Eligibility email

- Complete first **Stripe** payment for a user (gallery, upgrade, or wallet top-up in test mode) → Verify follow-up email with unique referral code and referral link (sent from webhook). Paying first gallery with wallet only (welcome bonus) must **not** send the eligibility email.

## Referrer flow

1. As **referrer**, open dashboard → Sidebar block shows rules, link (if eligible), stats.
2. Copy referral link → Open in incognito → Invite page shows Polish copy (“Zostałeś zaproszony…”) → Sign up as referred user (link includes `?ref=CODE`).
3. As **referred user**, create gallery → Publish → Enter referrer’s code (or ensure ref was pre-filled from invite) → Dry run shows discount → Complete payment (wallet or Stripe test).
4. Verify referrer gets reward email; referrer’s dashboard shows +1 successful referral and new earned code (e.g. 10%).

## Earned code flow

1. As user with earned code → Open **Moje kody rabatowe** → Copy code.
2. At Publish, select Small or Medium (1m/3m) plan → Paste earned code → Dry run shows discount → Complete payment.
3. Verify code moves to **Used**; `usedOnGalleryId` set.
4. Try same code on 10 GB or 12m plan → Error message in Polish (e.g. “Ten kod obowiązuje tylko dla planów 1 GB i 3 GB…”).

## Validation and errors

- Test checkout error messages (Polish): wrong tier (10 GB / 12m), code belongs to another account, code expired, code already used.
- One code per purchase; no combining with another promotion.

## Sidebar and My Discount Codes

- **Sidebar block** (bottom of AppSidebar): Rules, link, “Udane zaproszenia” / “Otrzymane bony” stats, “Pełne zasady i kody” link. No user IDs or PII.
- **Full page** (Settings → Moje kody rabatowe): Same data, copy button, full rules, table of earned codes (type, status, expiry).

## Webhook and idempotency

- Pay with referral code → Stripe webhook fires → Referrer reward granted, referralCount incremented, referralHistory entry added.
- Replay webhook (same session) → No double grant (idempotency by galleryId).

## Wallet-only path

- Pay fully with wallet (no Stripe) → Referrer reward and earned code marking still applied in `pay.ts` path; referrer reward email and code marked used as in webhook path. **Eligibility email is not sent** on wallet-only path—eligibility is granted only after the first successful Stripe payment (handled in webhook).

## Checklist summary

- [ ] Eligibility: new user vs after first paid gallery
- [ ] Second email (referral program info, no code)
- [ ] Eligibility email (code + link after first paid gallery)
- [ ] Referrer reward email (after 1st/3rd/10th referral; 10+ = 20 PLN wallet + Top Inviter badge)
- [ ] Invite page (`/invite/[code]`) and sign-up with `?ref=CODE`
- [ ] Publish with referral code and with earned code
- [ ] Validation errors (Polish messages)
- [ ] Sidebar block + My Discount Codes page
- [ ] Webhook idempotency (no double grant)
- [ ] Wallet-only path (referrer reward + code used; no eligibility email; eligibility only after first Stripe payment)
- [ ] No PII in sidebar UI
