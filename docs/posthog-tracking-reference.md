# PostHog Tracking Reference

This document provides a comprehensive reference for all PostHog tracking actions, properties, and cohort creation guidelines implemented in the PhotoCloud application.

## Overview

PostHog tracking is implemented using data attributes (`data-ph-action`) on DOM elements. This approach allows PostHog to automatically capture user interactions without requiring explicit JavaScript event tracking calls. When PostHog is integrated, these attributes will enable action creation, funnel analysis, and cohort building.

## Naming Convention

All PostHog actions follow the `category:object_action` pattern:
- **Category**: Context where the event occurred (e.g., `auth`, `gallery`, `payment`)
- **Object**: Component or location (e.g., `signup_button`, `wizard_next`)
- **Action**: Verb describing what happened (e.g., `click`, `submit`, `select`)

Examples:
- `auth:signup_button_click`
- `gallery:wizard_next_click`
- `payment:duration_select`

## Tracked Actions

### Gallery App (Client-Facing)

The gallery app (`frontend/gallery/`) tracks client interactions with galleries, including downloads, selections, navigation, and other behaviors.

#### Downloads
- `gallery_app:zip_download_click` - ZIP download button clicked
- `gallery_app:zip_download_success` - ZIP download completed successfully
- `gallery_app:zip_download_error` - ZIP download failed
- `gallery_app:single_photo_download_click` - Single photo download initiated
- `gallery_app:single_photo_download_success` - Single photo download completed successfully
- `gallery_app:single_photo_download_error` - Single photo download failed

**Properties:**
- `download_type` ("zip" | "single")
- `download_method` ("button" | "right_click" | "long_press")
- `image_key` (string)
- `order_id` (string, for final photos)

#### Right-Click Attempts
- `gallery_app:right_click_attempt` - User attempted right-click (desktop)
- `gallery_app:long_press_attempt` - User attempted long-press (mobile)
- `gallery_app:download_button_right_click` - User right-clicked download button

**Properties:**
- `download_method` ("right_click" | "long_press")

#### Layout Selection
- `gallery_app:layout_change` - Layout changed
  - Property: `data-ph-property-gallery_app_layout` ("standard" | "square" | "marble" | "carousel")

**Properties:**
- `gallery_app_layout` ("standard" | "square" | "marble" | "carousel")

#### View & Navigation
- `gallery_app:view_mode_change` - View mode changed (all/selected)
- `gallery_app:section_navigation` - Navigated between sections

**Properties:**
- `gallery_app_view_mode` ("all" | "selected")
- `gallery_app_section` ("delivered" | "bought" | "unselected" | "wybrane" | "selecting")

#### Selection Behaviors
- `gallery_app:image_select` - Image selected
- `gallery_app:image_deselect` - Image deselected
- `gallery_app:approve_selection_click` - Approve selection button clicked
- `gallery_app:approve_selection_success` - Selection approved successfully
- `gallery_app:photo_book_toggle` - Photo book selection toggled
- `gallery_app:photo_print_toggle` - Photo print selection toggled

**Properties:**
- `selection_count` (number)
- `photo_book_count` (number)
- `photo_print_count` (number)
- `image_key` (string)
- `gallery_app_section` ("selecting" | "unselected")
- `is_adding` (boolean, for photo book/print)

#### Request Changes Flow
- `gallery_app:request_changes_click` - Request changes button clicked
- `gallery_app:request_changes_success` - Change request submitted successfully
- `gallery_app:cancel_change_request_click` - Cancel change request button clicked

#### LightGallery Interactions
- `gallery_app:light_gallery_open` - LightGallery opened
- `gallery_app:light_gallery_close` - LightGallery closed
- `gallery_app:light_gallery_navigate` - Navigated within LightGallery (prev/next)

**Properties:**
- `light_gallery_action` ("open" | "close" | "prev" | "next")
- `image_index` (number)
- `previous_index` (number, for navigation)

#### Authentication
- `gallery_app:client_login_submit` - Client login form submitted
- `gallery_app:client_logout_click` - Logout button clicked

**Properties:**
- `gallery_id` (string)

#### Help
- `gallery_app:help_overlay_open` - Help overlay opened
- `gallery_app:help_overlay_close` - Help overlay closed

#### Other Interactions
- `gallery_app:buy_more_click` - "Buy more" button clicked
- `gallery_app:infinite_scroll_load_more` - Infinite scroll triggered (load more images)
- `gallery_app:order_select` - Order selected from list

**Properties:**
- `order_id` (string)
- `order_number` (string)

### Landing Page (Marketing Site)

The landing page (`frontend/landing/`) tracks visitor interactions with the marketing website, including navigation, CTAs, pricing interactions, and conversion funnels.

#### Hero Section
- `landing:hero_cta_click` - Hero CTA button clicked ("Rozpocznij za darmo")
- `landing:hero_section_view` - Hero section entered viewport (programmatic)

**Properties:**
- `landing_section` ("hero")

#### Navigation
- `landing:logo_click` - Logo/home link clicked
- `landing:nav_menu_item_click` - Navigation menu item clicked
- `landing:nav_dropdown_item_click` - Dropdown menu item clicked
- `landing:nav_login_click` - Login button clicked in navbar
- `landing:nav_signup_click` - Sign-up button clicked in navbar
- `landing:mobile_menu_open` - Mobile menu opened
- `landing:mobile_menu_close` - Mobile menu closed
- `landing:mobile_menu_item_click` - Mobile menu item clicked

**Properties:**
- `landing_nav_item` (string, e.g., "Funkcje", "Cennik", "Zasoby")

#### About Section
- `landing:about_tab_click` - About section tab clicked
- `landing:about_section_view` - About section entered viewport (programmatic)

**Properties:**
- `landing_tab` ("who" | "vision" | "history")
- `landing_section` ("about")

#### Services Section
- `landing:services_section_view` - Services section entered viewport (programmatic)
- `landing:service_card_view` - Service card entered viewport (programmatic)

**Properties:**
- `landing_section` ("services")

#### Pricing Section (Home Page)
- `landing:pricing_duration_select` - Duration selector clicked (1m/3m/12m)
- `landing:pricing_plan_card_click` - Pricing plan card clicked
- `landing:pricing_cta_click` - Pricing CTA button clicked
- `landing:pricing_section_view` - Pricing section entered viewport (programmatic)

**Properties:**
- `landing_duration` ("1m" | "3m" | "12m")
- `landing_plan_name` ("1GB" | "3GB" | "10GB")
- `landing_section` ("pricing")

#### CTA Section
- `landing:cta_button_click` - CTA section button clicked
- `landing:cta_section_view` - CTA section entered viewport (programmatic)

**Properties:**
- `landing_section` ("cta")

#### Testimonials Section
- `landing:testimonials_section_view` - Testimonials section entered viewport (programmatic)

**Properties:**
- `landing_section` ("testimonials")

#### Footer
- `landing:footer_link_click` - Footer link clicked
- `landing:footer_section_view` - Footer entered viewport (programmatic)

**Properties:**
- `landing_footer_link` (string, e.g., "Funkcje", "Cennik", "Ochrona hasłem")
- `landing_section` ("footer")

#### Pricing Page
- `landing:pricing_page_view` - Pricing page viewed (programmatic)
- `landing:pricing_page_duration_tab_change` - Duration tab changed
- `landing:pricing_page_plan_card_click` - Plan card clicked
- `landing:pricing_page_plan_card_hover` - Plan card hovered (programmatic)
- `landing:pricing_page_faq_open` - FAQ accordion item opened
- `landing:pricing_page_cta_click` - Pricing page CTA button clicked

**Properties:**
- `landing_duration` ("1m" | "3m" | "12m")
- `landing_plan_name` ("1GB" | "3GB" | "10GB")

#### Feature Pages
- `landing:feature_page_view` - Feature page viewed (programmatic)
- `landing:feature_card_click` - Feature card "Dowiedz się więcej" button clicked
- `landing:feature_page_cta_click` - Feature page CTA button clicked

**Properties:**
- `landing_feature_page` ("password-protection" | "cost-efficient" | "flexible-pricing" | "client-selection")

#### Scroll Behavior
- `landing:scroll_depth_25` - User scrolled 25% of page (programmatic)
- `landing:scroll_depth_50` - User scrolled 50% of page (programmatic)
- `landing:scroll_depth_75` - User scrolled 75% of page (programmatic)
- `landing:scroll_depth_100` - User scrolled 100% of page (programmatic)
- `landing:scroll_to_top_click` - Scroll-to-top button clicked

**Properties:**
- `landing_scroll_depth` (25 | 50 | 75 | 100)

#### Page Views
- `landing:home_page_view` - Home page viewed (programmatic)
- `landing:pricing_page_view` - Pricing page viewed (programmatic)
- `landing:features_page_view` - Features page viewed (programmatic)
- `landing:help_page_view` - Help page viewed (programmatic)

**Properties:**
- `landing_page_path` (string, e.g., "/", "/pricing", "/features")

### Dashboard App (Photographer-Facing)

The dashboard app (`frontend/dashboard/`) tracks photographer interactions with the platform.

### Authentication Flow

#### Sign Up Page (`/sign-up`)
- `auth:signup_form_submit` - Form submission
- `auth:signup_email_input` - Email input field interaction
- `auth:signup_password_input` - Password input field interaction
- `auth:signup_terms_accept` - Terms checkbox checked
- `auth:signup_privacy_accept` - Privacy checkbox checked
- `auth:signup_accept_all_click` - "Accept all consents" button clicked
- `auth:signup_button_click` - Submit button clicked
- `auth:signup_referral_code_view` - Referral code displayed (if present)
- `auth:login_button_click` - Link to login page clicked

**Properties to capture:**
- `has_referral_code` (boolean)
- `referral_code_validated` (boolean)

#### Login Page (`/login`)
- `auth:login_form_submit` - Form submission
- `auth:login_email_input` - Email input field interaction
- `auth:login_password_input` - Password input field interaction
- `auth:login_button_click` - Submit button clicked
- `auth:forgot_password_link_click` - "Forgot password" link clicked
- `auth:signup_link_click` - Link to sign-up page clicked

#### Register Subdomain Page (`/register-subdomain`)
- `auth:subdomain_form_submit` - Form submission
- `auth:subdomain_input_change` - Subdomain input field changed
- `auth:subdomain_button_click` - Submit button clicked

**Properties to capture:**
- `subdomain_available` (boolean)
- `subdomain_length` (number)

### Gallery Management

#### Create Gallery Wizard
- `gallery:type_select` - Gallery type selected (selection/non-selection)
  - Property: `data-ph-property-gallery_type` ("selection" | "non-selection")
- `gallery:name_input` - Gallery name input field interaction
- `gallery:package_select` - Package selected
- `gallery:wizard_next_click` - Next step button clicked
- `gallery:wizard_back_click` - Back button clicked
- `gallery:wizard_submit_click` - Final submit button clicked

**Properties to capture:**
- `gallery_type` (selection | non-selection)
- `wizard_step` (number)
- `has_client` (boolean)

#### Publish Gallery Wizard
- `gallery:publish_duration_select` - Plan duration selected
  - Property: `data-ph-property-duration` ("1m" | "3m" | "12m")
- `gallery:publish_plan_select` - Plan selected
  - Property: `data-ph-property-plan_key` (string)
- `gallery:publish_button_click` - Publish button clicked

**Properties to capture:**
- `selected_plan_key` (string)
- `selected_duration` ("1m" | "3m" | "12m")
- `suggested_storage` ("1GB" | "3GB" | "10GB")
- `plan_price_cents` (number)
- `has_referral_discount` (boolean)
- `referral_discount_percent` (10 | 15 | null)

### Payment Flow

#### Plan Selection Components
- `payment:duration_select` - Duration button clicked (1m/3m/12m)
  - Property: `data-ph-property-duration` ("1m" | "3m" | "12m")
- `payment:plan_card_click` - Plan card clicked
  - Property: `data-ph-property-plan_key` (string, e.g., "1GB-1m")
- `payment:plan_price_view` - Plan price displayed

**Properties to capture:**
- `plan_key` (string, e.g., "1GB-1m")
- `plan_price_cents` (number)
- `plan_storage_gb` (number)
- `plan_duration_days` (number)
- `is_upgrade` (boolean)
- `upgrade_price_cents` (number, if upgrade)

#### Payment Processing (Programmatic Events)
These events should be tracked programmatically when PostHog is integrated:
- `payment:wallet_payment_initiated` - Wallet payment started
- `payment:stripe_checkout_initiated` - Stripe checkout started
- `payment:payment_completed` - Payment completed successfully

**Properties to capture:**
- `payment_method` ("wallet" | "stripe" | "mixed")
- `total_amount_cents` (number)
- `wallet_amount_cents` (number)
- `stripe_amount_cents` (number)
- `has_referral_discount` (boolean)

### Upload Flow

#### Upload Components
- `upload:modal_open` - Upload modal opened
- `upload:upload_start` - Upload started
- `upload:completion_view` - Upload completion overlay displayed
- `upload:dismiss_click` - Upload completion overlay dismissed

**Properties to capture:**
- `upload_type` ("originals" | "finals")
- `file_count` (number)
- `total_bytes` (number)
- `upload_duration_ms` (number)
- `success_count` (number)
- `failed_count` (number)

### Client Management

#### Client Step (Gallery Wizard)
- `client:email_input` - Client email input field interaction
- `client:save_button_click` - Save client button clicked
- `client:company_toggle` - Company toggle clicked
  - Property: `data-ph-property-is_company` ("true" | "false")

**Properties to capture:**
- `is_company` (boolean)
- `has_vat` (boolean)

### Order Management

#### Order Actions
- `order:send_button_click` - Send to client button clicked
- `order:approve_button_click` - Approve change request button clicked
- `order:request_changes_click` - Request changes button clicked
- `order:mark_delivered_click` - Mark delivered button clicked

**Properties to capture:**
- `order_status` (string)
- `gallery_type` ("selection" | "non-selection")

### Settings

#### Settings Pages
- `settings:password_change_submit` - Password change form submitted
- `settings:account_delete_click` - Account deletion button clicked

**Properties to capture:**
- `tab_name` (string, for tab navigation if implemented)

## User Properties

These properties should be set via PostHog's `identify()` method when PostHog is integrated:

- `user_id` (string) - User's unique identifier
- `user_email` (string, hashed) - User's email address
- `signup_date` (ISO timestamp) - When user signed up
- `acquisition_source` ("organic" | "referral" | "google_ads" | "social" | "other") - How user found the service
- `has_referral_code` (boolean) - Whether user has a referral code
- `first_gallery_created_at` (ISO timestamp) - When user created their first gallery
- `total_galleries` (number) - Total number of galleries created
- `total_payments` (number) - Total number of payments made
- `total_spent_cents` (number) - Total amount spent (in cents)

## Event Properties

These properties should be attached to events when PostHog is integrated:

- `gallery_id` (string) - For gallery-related events
- `order_id` (string) - For order-related events
- `plan_key` (string) - For payment events
- `payment_method` ("wallet" | "stripe" | "mixed") - For payment events

## Cohort Creation Guide

### Recommended Cohorts

#### 1. Completed Signup
**Definition**: Users who completed the signup form
**Action**: `auth:signup_form_submit`
**Use Case**: Track signup conversion rate

#### 2. Created First Gallery
**Definition**: Users who completed the gallery creation wizard
**Action**: `gallery:wizard_submit_click`
**Properties**: Any user who triggered this event
**Use Case**: Measure onboarding completion

#### 3. Made Payment
**Definition**: Users who completed a payment
**Action**: `payment:payment_completed` (programmatic event)
**Use Case**: Track paying customers

#### 4. Upgraded Plan
**Definition**: Users who completed payment with upgrade flag
**Action**: `payment:payment_completed`
**Properties**: `is_upgrade = true`
**Use Case**: Track plan upgrades

#### 5. Referral Users
**Definition**: Users who signed up with a referral code
**User Property**: `has_referral_code = true`
**Use Case**: Analyze referral program effectiveness

#### 6. Active Uploaders
**Definition**: Users who have uploaded files
**Action**: `upload:upload_start`
**Use Case**: Identify active users

#### 7. Completed Order Delivery
**Definition**: Users who marked an order as delivered
**Action**: `order:mark_delivered_click`
**Use Case**: Track order completion rate

#### 8. Gallery App Users (Clients)
**Definition**: Clients who logged into a gallery
**Action**: `gallery_app:client_login_submit`
**Use Case**: Track client engagement

#### 9. Clients Who Downloaded ZIPs
**Definition**: Clients who downloaded ZIP files
**Action**: `gallery_app:zip_download_success`
**Use Case**: Measure download engagement

#### 10. Clients Who Selected Photos
**Definition**: Clients who selected at least one photo
**Action**: `gallery_app:image_select`
**Use Case**: Track selection engagement

#### 11. Clients Who Approved Selection
**Definition**: Clients who approved their selection
**Action**: `gallery_app:approve_selection_success`
**Use Case**: Measure conversion from selection to approval

#### 12. Clients Who Requested Changes
**Definition**: Clients who requested changes to approved selection
**Action**: `gallery_app:request_changes_success`
**Use Case**: Track change request rate

#### 13. Right-Click Attempters
**Definition**: Clients who attempted right-click or long-press
**Action**: `gallery_app:right_click_attempt` OR `gallery_app:long_press_attempt`
**Use Case**: Measure protection effectiveness

#### 14. Landing Page Visitors
**Definition**: Users who visited the landing page
**Action**: `landing:home_page_view`
**Use Case**: Track marketing site traffic

#### 15. Landing Page Engaged Visitors
**Definition**: Visitors who scrolled past 50% of the landing page
**Action**: `landing:scroll_depth_50`
**Use Case**: Measure engagement with marketing content

#### 16. Pricing Page Visitors
**Definition**: Users who visited the pricing page
**Action**: `landing:pricing_page_view`
**Use Case**: Track pricing interest

#### 17. Feature Page Visitors
**Definition**: Users who visited feature detail pages
**Action**: `landing:feature_page_view`
**Use Case**: Measure feature interest

### Funnel Analysis

#### Signup to Payment Funnel
1. `auth:signup_form_submit` - Signup started
2. `auth:subdomain_form_submit` - Subdomain registered
3. `gallery:wizard_submit_click` - First gallery created
4. `gallery:publish_button_click` - Gallery publish initiated
5. `payment:payment_completed` - Payment completed

**Conversion Points to Track:**
- Signup → Subdomain Registration
- Subdomain → First Gallery
- First Gallery → Publish Initiated
- Publish Initiated → Payment Completed

#### Gallery Creation Funnel
1. `gallery:type_select` - Gallery type selected
2. `gallery:name_input` - Gallery name entered
3. `gallery:package_select` - Package selected
4. `client:save_button_click` - Client saved
5. `gallery:wizard_submit_click` - Gallery created

#### Client Selection Funnel (Gallery App)
1. `gallery_app:client_login_submit` - Client logged in
2. `gallery_app:image_select` - First photo selected
3. `gallery_app:approve_selection_click` - Approve button clicked
4. `gallery_app:approve_selection_success` - Selection approved
5. `gallery_app:zip_download_success` OR `gallery_app:single_photo_download_success` - Photos downloaded

**Conversion Points to Track:**
- Login → First Selection
- First Selection → Approval Click
- Approval Click → Approval Success
- Approval Success → Download

#### Download Behavior Funnel
1. `gallery_app:zip_download_click` OR `gallery_app:single_photo_download_click` - Download initiated
2. `gallery_app:zip_download_success` OR `gallery_app:single_photo_download_success` - Download completed

**Conversion Points to Track:**
- Download Click → Download Success
- ZIP vs Single Photo preference

#### Main Conversion Funnel (Landing Page)
1. `landing:home_page_view` - User lands on homepage
2. `landing:hero_section_view` - User sees hero section
3. `landing:hero_cta_click` OR `landing:nav_signup_click` - User clicks signup
4. (Redirects to dashboard signup - tracked separately)

**Conversion Points to Track:**
- Home Page View → Hero Section View
- Hero Section View → CTA Click
- Navigation Signup Click → Dashboard Signup

#### Engagement Funnel (Landing Page)
1. `landing:home_page_view` - User lands
2. `landing:scroll_depth_25` - User scrolls 25%
3. `landing:pricing_section_view` - User sees pricing
4. `landing:pricing_duration_select` - User interacts with pricing
5. `landing:pricing_cta_click` - User clicks pricing CTA

**Conversion Points to Track:**
- Page View → Scroll Depth 25%
- Scroll Depth 25% → Pricing Section View
- Pricing Section View → Duration Select
- Duration Select → Pricing CTA Click

#### Feature Discovery Funnel (Landing Page)
1. `landing:nav_menu_item_click` (Funkcje) - User clicks Features
2. `landing:features_page_view` - User views features page
3. `landing:feature_card_click` - User clicks feature card
4. `landing:feature_page_view` - User views feature detail
5. `landing:feature_page_cta_click` - User clicks CTA

**Conversion Points to Track:**
- Nav Menu Click → Features Page View
- Features Page View → Feature Card Click
- Feature Card Click → Feature Page View
- Feature Page View → Feature Page CTA Click

#### Pricing Page Funnel
1. `landing:pricing_page_view` - User visits pricing page
2. `landing:pricing_page_duration_tab_change` - User changes duration
3. `landing:pricing_page_plan_card_hover` - User hovers plan
4. `landing:pricing_page_plan_card_click` - User clicks plan
5. `landing:pricing_page_cta_click` - User clicks CTA

**Conversion Points to Track:**
- Pricing Page View → Duration Tab Change
- Duration Tab Change → Plan Card Hover
- Plan Card Hover → Plan Card Click
- Plan Card Click → Pricing Page CTA Click

## PostHog Configuration

When implementing PostHog, configure the following:

### Autocapture Settings
```javascript
posthog.init('YOUR_API_KEY', {
  autocapture: {
    css_selector_allowlist: ['[data-ph-action]', '[data-ph-capture]'],
    element_allowlist: ['button', 'form', 'a', 'input', 'select', 'textarea'],
    dom_event_allowlist: ['click', 'submit', 'change']
  }
});
```

### Action Creation
1. Use PostHog Toolbar to create actions from data attributes
2. Group related actions (e.g., all `auth:*` actions)
3. Use consistent naming in PostHog dashboard

### Property Capture
Properties can be captured via:
- Data attributes: `data-ph-property-*`
- Programmatic tracking: `posthog.capture('event_name', { property: value })`
- User identification: `posthog.identify(userId, { property: value })`

## Implementation Notes

- All data attributes use the `data-ph-*` prefix for PostHog compatibility
- Properties use snake_case to match PostHog conventions
- Action names follow `category:object_action` pattern for easy filtering
- Data attributes are non-breaking: they don't affect functionality if PostHog isn't loaded
- Consider adding a PostHog wrapper utility to standardize event tracking once PostHog is integrated

## Testing

### Manual Testing
1. Use PostHog Toolbar to verify actions are captured
2. Check that properties are attached correctly
3. Verify cohorts can be created from actions

### Automated Testing
- Add tests to ensure data attributes are present on key elements
- Verify action names follow naming convention

## Next Steps

1. **Integrate PostHog SDK**: Add PostHog JavaScript library to the application
2. **Configure Autocapture**: Set up autocapture to use `data-ph-action` attributes
3. **Set User Properties**: Implement `posthog.identify()` calls with user properties
4. **Track Programmatic Events**: Add `posthog.capture()` calls for payment events
5. **Create Initial Cohorts**: Set up recommended cohorts in PostHog dashboard
6. **Build Funnels**: Create funnel analyses for key user flows
7. **Monitor and Iterate**: Review tracking data and adjust as needed

## File Locations

### Core Files
- PostHog Types: `frontend/dashboard/lib/posthog-types.ts`
- Button Component: `frontend/dashboard/components/ui/button/Button.tsx`

### Authentication Pages
- Sign Up: `frontend/dashboard/pages/sign-up.tsx`
- Login: `frontend/dashboard/pages/login.tsx`
- Register Subdomain: `frontend/dashboard/pages/register-subdomain.tsx`

### Gallery Components
- Create Wizard: `frontend/dashboard/components/galleries/CreateGalleryWizard.tsx`
- Publish Wizard: `frontend/dashboard/components/galleries/PublishGalleryWizard.tsx`
- Gallery Type Step: `frontend/dashboard/components/galleries/wizard/GalleryTypeStep.tsx`
- Gallery Name Step: `frontend/dashboard/components/galleries/wizard/GalleryNameStep.tsx`
- Client Step: `frontend/dashboard/components/galleries/wizard/ClientStep.tsx`
- Package Step: `frontend/dashboard/components/galleries/wizard/PackageStep.tsx`

### Payment Components
- Suggested Plan Section: `frontend/dashboard/components/galleries/pricing/SuggestedPlanSection.tsx`
- Plan Selection Grid: `frontend/dashboard/components/galleries/pricing/PlanSelectionGrid.tsx`

### Upload Components
- Upload Modal: `frontend/dashboard/components/uppy/UppyUploadModal.tsx`
- Upload Completion Overlay: `frontend/dashboard/components/uppy/UploadCompletionOverlay.tsx`

### Order Components
- Order Actions: `frontend/dashboard/components/galleries/sidebar/OrderActionsSection.tsx`

### Settings Components
- Settings Account: `frontend/dashboard/components/settings/SettingsAccount.tsx`
- Settings Security: `frontend/dashboard/components/settings/SettingsSecurity.tsx`

### Gallery App Components
- PostHog Helper: `frontend/gallery/lib/posthog.ts`
- Gallery Page: `frontend/gallery/app/(gallery)/[id]/page.tsx`
- Gallery Top Bar: `frontend/gallery/components/gallery/GalleryTopBar.tsx`
- Secondary Menu: `frontend/gallery/components/gallery/SecondaryMenu.tsx`
- Virtuoso Grid: `frontend/gallery/components/gallery/VirtuosoGrid.tsx`
- LightGallery Wrapper: `frontend/gallery/components/gallery/LightGalleryWrapper.tsx`
- Order ZIP Button: `frontend/gallery/components/gallery/OrderZipButton.tsx`
- Download Hook: `frontend/gallery/hooks/useImageDownload.ts`
- Context Menu Prevention: `frontend/gallery/components/gallery/ContextMenuPrevention.tsx`
- Download Button Feedback: `frontend/gallery/components/gallery/DownloadButtonFeedback.tsx`

### Landing Page Components
- Home Page: `frontend/landing/app/(marketing)/page.tsx`
- Pricing Page: `frontend/landing/app/(marketing)/pricing/page.tsx`
- Features Page: `frontend/landing/app/(marketing)/features/page.tsx`
- Feature Detail Pages: `frontend/landing/app/(marketing)/features/*/page.tsx`
- Navbar: `frontend/landing/components/navigation/navbar.tsx`
- Mobile Navbar: `frontend/landing/components/navigation/mobile-navbar.tsx`
- Footer: `frontend/landing/components/navigation/footer.tsx`
- Pricing Cards: `frontend/landing/components/pricing-cards.tsx`
- Scroll to Top: `frontend/landing/components/scroll-to-top.tsx`
- Layout: `frontend/landing/app/(marketing)/layout.tsx`
- Help Overlay: `frontend/gallery/components/gallery/HelpOverlay.tsx`
- Login Form: `frontend/gallery/components/login/LoginFormPane.tsx`
- Delivered Order Card: `frontend/gallery/components/gallery/DeliveredOrderCard.tsx`
