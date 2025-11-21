// constants
import { APP_DOMAIN, APP_HOSTNAMES, APP_NAME } from "./constants/site";
import { aeonik, inter } from "./constants/fonts";
import { NAV_LINKS } from "./nav-links";
import { COMPANIES, PROCESS, REVIEWS, DEFAULT_AVATAR_URL, PAGINATION_LIMIT } from "./constants/misc";
import { PLANS, PRICING_FEATURES, WORKSPACE_LIMIT } from "./constants/pricing";

// functions
import { cn } from "./functions/cn";
import { generateMetadata } from "./functions/metadata";

export {
  // constants
  APP_DOMAIN,
  APP_HOSTNAMES,
  APP_NAME,
  NAV_LINKS,
  aeonik,
  inter,
  COMPANIES,
  PROCESS,
  REVIEWS,
  DEFAULT_AVATAR_URL,
  PAGINATION_LIMIT,
  PLANS,
  PRICING_FEATURES,
  WORKSPACE_LIMIT,

  // functions
  cn,
  generateMetadata,
};

