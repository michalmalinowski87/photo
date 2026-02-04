/**
 * PostHog tracking types and utilities
 * 
 * This module provides TypeScript types and helper functions for PostHog event tracking.
 * It ensures consistent naming conventions and type safety for analytics events.
 */

/**
 * PostHog action categories
 */
export type PostHogActionCategory =
  | "auth"
  | "gallery"
  | "payment"
  | "upload"
  | "client"
  | "order"
  | "settings"
  | "dashboard"
  | "gallery_app"
  | "landing";

/**
 * PostHog action types
 */
export type PostHogActionType =
  | "click"
  | "submit"
  | "view"
  | "select"
  | "upload"
  | "delete"
  | "publish"
  | "input"
  | "change"
  | "toggle"
  | "open"
  | "close"
  | "dismiss"
  | "attempt"
  | "success"
  | "error"
  | "navigate";

/**
 * PostHog action name format: category:object_action
 * Example: "auth:signup_button_click"
 */
export type PostHogActionName = `${PostHogActionCategory}:${string}_${PostHogActionType}`;

/**
 * Helper function to create a PostHog action name
 * @param category - The action category (e.g., "auth", "gallery")
 * @param object - The object being acted upon (e.g., "signup_button", "gallery_wizard")
 * @param action - The action type (e.g., "click", "submit")
 * @returns Formatted action name
 */
export function createPostHogActionName(
  category: PostHogActionCategory,
  object: string,
  action: PostHogActionType
): PostHogActionName {
  return `${category}:${object}_${action}` as PostHogActionName;
}

/**
 * Common PostHog action names for easy reference
 */
export const PostHogActions = {
  // Authentication
  auth: {
    signupFormSubmit: "auth:signup_form_submit" as const,
    signupButtonClick: "auth:signup_button_click" as const,
    signupEmailInput: "auth:signup_email_input" as const,
    signupPasswordInput: "auth:signup_password_input" as const,
    signupTermsAccept: "auth:signup_terms_accept" as const,
    signupPrivacyAccept: "auth:signup_privacy_accept" as const,
    signupAcceptAllClick: "auth:signup_accept_all_click" as const,
    signupReferralCodeView: "auth:signup_referral_code_view" as const,
    loginFormSubmit: "auth:login_form_submit" as const,
    loginButtonClick: "auth:login_button_click" as const,
    loginEmailInput: "auth:login_email_input" as const,
    loginPasswordInput: "auth:login_password_input" as const,
    forgotPasswordLinkClick: "auth:forgot_password_link_click" as const,
    signupLinkClick: "auth:signup_link_click" as const,
    subdomainInputChange: "auth:subdomain_input_change" as const,
    subdomainFormSubmit: "auth:subdomain_form_submit" as const,
    subdomainButtonClick: "auth:subdomain_button_click" as const,
  },
  // Gallery
  gallery: {
    typeSelect: "gallery:type_select" as const,
    nameInput: "gallery:name_input" as const,
    clientFormSubmit: "gallery:client_form_submit" as const,
    packageSelect: "gallery:package_select" as const,
    wizardNextClick: "gallery:wizard_next_click" as const,
    wizardBackClick: "gallery:wizard_back_click" as const,
    wizardSubmitClick: "gallery:wizard_submit_click" as const,
    publishDurationSelect: "gallery:publish_duration_select" as const,
    publishPlanSelect: "gallery:publish_plan_select" as const,
    publishButtonClick: "gallery:publish_button_click" as const,
  },
  // Payment
  payment: {
    durationSelect: "payment:duration_select" as const,
    planCardClick: "payment:plan_card_click" as const,
    planPriceView: "payment:plan_price_view" as const,
    walletPaymentInitiated: "payment:wallet_payment_initiated" as const,
    stripeCheckoutInitiated: "payment:stripe_checkout_initiated" as const,
    paymentCompleted: "payment:payment_completed" as const,
  },
  // Upload
  upload: {
    modalOpen: "upload:modal_open" as const,
    start: "upload:upload_start" as const,
    completionView: "upload:completion_view" as const,
    dismissClick: "upload:dismiss_click" as const,
  },
  // Client
  client: {
    emailInput: "client:email_input" as const,
    saveButtonClick: "client:save_button_click" as const,
    companyToggle: "client:company_toggle" as const,
  },
  // Order
  order: {
    sendButtonClick: "order:send_button_click" as const,
    approveButtonClick: "order:approve_button_click" as const,
    requestChangesClick: "order:request_changes_click" as const,
    markDeliveredClick: "order:mark_delivered_click" as const,
  },
  // Settings
  settings: {
    tabSelect: "settings:tab_select" as const,
    passwordChangeSubmit: "settings:password_change_submit" as const,
    accountDeleteClick: "settings:account_delete_click" as const,
  },
  // Gallery App (client-facing)
  galleryApp: {
    // Downloads
    zipDownloadClick: "gallery_app:zip_download_click" as const,
    zipDownloadSuccess: "gallery_app:zip_download_success" as const,
    zipDownloadError: "gallery_app:zip_download_error" as const,
    singlePhotoDownloadClick: "gallery_app:single_photo_download_click" as const,
    singlePhotoDownloadSuccess: "gallery_app:single_photo_download_success" as const,
    singlePhotoDownloadError: "gallery_app:single_photo_download_error" as const,
    // Right-click attempts
    rightClickAttempt: "gallery_app:right_click_attempt" as const,
    longPressAttempt: "gallery_app:long_press_attempt" as const,
    downloadButtonRightClick: "gallery_app:download_button_right_click" as const,
    // Layouts
    layoutChange: "gallery_app:layout_change" as const,
    // Views
    viewModeChange: "gallery_app:view_mode_change" as const,
    sectionNavigation: "gallery_app:section_navigation" as const,
    // Selection
    imageSelect: "gallery_app:image_select" as const,
    imageDeselect: "gallery_app:image_deselect" as const,
    approveSelectionClick: "gallery_app:approve_selection_click" as const,
    approveSelectionSuccess: "gallery_app:approve_selection_success" as const,
    // Request changes
    requestChangesClick: "gallery_app:request_changes_click" as const,
    requestChangesSuccess: "gallery_app:request_changes_success" as const,
    cancelChangeRequestClick: "gallery_app:cancel_change_request_click" as const,
    // Photo book/print
    photoBookToggle: "gallery_app:photo_book_toggle" as const,
    photoPrintToggle: "gallery_app:photo_print_toggle" as const,
    // LightGallery
    lightGalleryOpen: "gallery_app:light_gallery_open" as const,
    lightGalleryClose: "gallery_app:light_gallery_close" as const,
    lightGalleryNavigate: "gallery_app:light_gallery_navigate" as const,
    // Authentication
    clientLoginSubmit: "gallery_app:client_login_submit" as const,
    clientLogoutClick: "gallery_app:client_logout_click" as const,
    // Help
    helpOverlayOpen: "gallery_app:help_overlay_open" as const,
    helpOverlayClose: "gallery_app:help_overlay_close" as const,
    // Other
    buyMoreClick: "gallery_app:buy_more_click" as const,
    infiniteScrollLoadMore: "gallery_app:infinite_scroll_load_more" as const,
    orderSelect: "gallery_app:order_select" as const,
  },
  // Landing Page
  landing: {
    // Hero
    heroCtaClick: "landing:hero_cta_click" as const,
    heroSectionView: "landing:hero_section_view" as const,
    // Navigation
    logoClick: "landing:logo_click" as const,
    navMenuItemClick: "landing:nav_menu_item_click" as const,
    navDropdownItemClick: "landing:nav_dropdown_item_click" as const,
    navLoginClick: "landing:nav_login_click" as const,
    navSignupClick: "landing:nav_signup_click" as const,
    mobileMenuOpen: "landing:mobile_menu_open" as const,
    mobileMenuClose: "landing:mobile_menu_close" as const,
    mobileMenuItemClick: "landing:mobile_menu_item_click" as const,
    // About Section
    aboutTabClick: "landing:about_tab_click" as const,
    aboutSectionView: "landing:about_section_view" as const,
    // Services Section
    servicesSectionView: "landing:services_section_view" as const,
    serviceCardView: "landing:service_card_view" as const,
    // Pricing Section (Home)
    pricingDurationSelect: "landing:pricing_duration_select" as const,
    pricingPlanCardClick: "landing:pricing_plan_card_click" as const,
    pricingCtaClick: "landing:pricing_cta_click" as const,
    pricingSectionView: "landing:pricing_section_view" as const,
    // CTA Section
    ctaButtonClick: "landing:cta_button_click" as const,
    ctaSectionView: "landing:cta_section_view" as const,
    // Testimonials
    testimonialsSectionView: "landing:testimonials_section_view" as const,
    // Footer
    footerLinkClick: "landing:footer_link_click" as const,
    footerSectionView: "landing:footer_section_view" as const,
    // Pricing Page
    pricingPageDurationTabChange: "landing:pricing_page_duration_tab_change" as const,
    pricingPagePlanCardClick: "landing:pricing_page_plan_card_click" as const,
    pricingPagePlanCardHover: "landing:pricing_page_plan_card_hover" as const,
    pricingPageFaqOpen: "landing:pricing_page_faq_open" as const,
    pricingPageCtaClick: "landing:pricing_page_cta_click" as const,
    // Feature Pages
    featurePageView: "landing:feature_page_view" as const,
    featureCardClick: "landing:feature_card_click" as const,
    featurePageCtaClick: "landing:feature_page_cta_click" as const,
    // Scroll Behavior
    scrollDepth25: "landing:scroll_depth_25" as const,
    scrollDepth50: "landing:scroll_depth_50" as const,
    scrollDepth75: "landing:scroll_depth_75" as const,
    scrollDepth100: "landing:scroll_depth_100" as const,
    scrollToTopClick: "landing:scroll_to_top_click" as const,
    // Page Views
    homePageView: "landing:home_page_view" as const,
    pricingPageView: "landing:pricing_page_view" as const,
    featuresPageView: "landing:features_page_view" as const,
    helpPageView: "landing:help_page_view" as const,
  },
} as const;

/**
 * PostHog event properties
 * These properties can be attached to events for better segmentation
 */
export interface PostHogEventProperties {
  // User properties
  user_id?: string;
  user_email?: string;
  signup_date?: string;
  acquisition_source?: "organic" | "referral" | "google_ads" | "social" | "other";
  has_referral_code?: boolean;
  first_gallery_created_at?: string;
  total_galleries?: number;
  total_payments?: number;
  total_spent_cents?: number;

  // Event-specific properties
  gallery_id?: string;
  order_id?: string;
  plan_key?: string;
  payment_method?: "wallet" | "stripe" | "mixed";
  gallery_type?: "selection" | "non-selection";
  order_status?: string;
  wizard_step?: number;
  has_client?: boolean;
  is_company?: boolean;
  has_vat?: boolean;
  upload_type?: "originals" | "finals";
  file_count?: number;
  total_bytes?: number;
  upload_duration_ms?: number;
  success_count?: number;
  failed_count?: number;
  selected_plan_key?: string;
  selected_duration?: "1m" | "3m" | "12m";
  suggested_storage?: "1GB" | "3GB" | "10GB";
  plan_price_cents?: number;
  has_referral_discount?: boolean;
  referral_discount_percent?: 10 | 15 | null;
  plan_storage_gb?: number;
  plan_duration_days?: number;
  is_upgrade?: boolean;
  upgrade_price_cents?: number;
  total_amount_cents?: number;
  wallet_amount_cents?: number;
  stripe_amount_cents?: number;
  referral_code_validated?: boolean;
  subdomain_available?: boolean;
  subdomain_length?: number;
  tab_name?: string;
  // Gallery app specific
  gallery_app_layout?: "standard" | "square" | "marble" | "carousel";
  gallery_app_view_mode?: "all" | "selected";
  gallery_app_section?: "delivered" | "bought" | "unselected" | "wybrane" | "selecting";
  download_type?: "zip" | "single";
  download_method?: "button" | "right_click" | "long_press";
  selection_count?: number;
  photo_book_count?: number;
  photo_print_count?: number;
  light_gallery_action?: "open" | "close" | "prev" | "next" | "zoom" | "fullscreen" | "rotate";
  image_key?: string;
  // Landing page specific
  landing_section?: "hero" | "about" | "services" | "pricing" | "cta" | "testimonials" | "footer";
  landing_tab?: "who" | "vision" | "history";
  landing_duration?: "1m" | "3m" | "12m";
  landing_plan_name?: "1GB" | "3GB" | "10GB";
  landing_nav_item?: string;
  landing_footer_link?: string;
  landing_feature_page?: "password-protection" | "cost-efficient" | "flexible-pricing" | "client-selection";
  landing_scroll_depth?: number;
  landing_page_path?: string;
}
