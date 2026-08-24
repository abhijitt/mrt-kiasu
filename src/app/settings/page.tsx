import { coverageStats } from "@/lib/positions";
import { SettingsScreen } from "./SettingsScreen";

export default function SettingsPage() {
  return <SettingsScreen stats={coverageStats()} />;
}
