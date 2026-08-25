import type { Metadata } from "next";
import mapData from "@/data/map.json";
import { MapScreen } from "./MapScreen";
import type { MapStation } from "@/components/NetworkMap";

export const metadata: Metadata = {
  title: "Map — MRT Kiasu",
  description: "Pick your stations from the Singapore MRT and LRT network map.",
};

/**
 * Server component, so map.json is read at build time and only the slim
 * generated dataset crosses to the browser.
 */
export default function MapPage() {
  return (
    <MapScreen
      stations={mapData.stations as MapStation[]}
      edges={mapData.edges as [string, string][]}
      unplaceable={mapData.unplaceable}
    />
  );
}
