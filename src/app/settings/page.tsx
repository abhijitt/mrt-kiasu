import { coverageStats } from "@/lib/positions";
import { surveyCoverage } from "@/lib/survey-coverage";
import { SettingsScreen } from "./SettingsScreen";

export default function SettingsPage() {
  return <SettingsScreen stats={coverageStats()} coverage={surveyCoverage()} />;
}
