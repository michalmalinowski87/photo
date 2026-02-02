import { useRouter } from "next/router";
import { useEffect } from "react";

import DiscountCodesSettings from "../../components/settings/DiscountCodesSettings";
import { GallerySettingsTab } from "../../components/settings/GallerySettingsTab";
import SettingsAccount from "../../components/settings/SettingsAccount";
import SettingsSecurity from "../../components/settings/SettingsSecurity";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function SettingsTab() {
  const router = useRouter();
  const { tab } = router.query;

  // Redirect to account if no tab specified
  useEffect(() => {
    if (!tab && router.isReady) {
      void router.replace("/settings/account");
    }
  }, [tab, router]);

  if (!router.isReady) {
    return null;
  }

  switch (tab) {
    case "account":
      return <SettingsAccount />;
    case "security":
      return <SettingsSecurity />;
    case "gallery":
      return <GallerySettingsTab />;
    case "discount-codes":
      return <DiscountCodesSettings />;
    default:
      return <SettingsAccount />;
  }
}
