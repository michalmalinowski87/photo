import DiscountCodesSettings from "../components/settings/DiscountCodesSettings";

// Simple wrapper page so "Zaproszenia i nagrody" is a first-class
// top-level view, not a nested settings tab.
export default function RewardsPage() {
  return <DiscountCodesSettings />;
}
