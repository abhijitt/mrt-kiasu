"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hud } from "@/components/Hud";
import { NetworkMap, type MapLayout, type MapStation } from "@/components/NetworkMap";
import { useSettings } from "@/lib/settings";
import { useT } from "@/i18n/I18nProvider";

interface Props {
  stations: MapStation[];
  edges: [string, string][];
  schematic: Record<string, { x: number; y: number }>;
  schematicExtent: { w: number; h: number };
  /** Stations with no coordinates, named rather than silently omitted. */
  unplaceable: { code: string; name: string }[];
}

/**
 * Pick two stations off the network map.
 *
 * The first tap sets the origin, the second the destination, and the second
 * navigates straight to the same route screen the search form reaches — the
 * map is another way in, not a separate feature with its own answer.
 */
export function MapScreen({ stations, edges, schematic, schematicExtent, unplaceable }: Props) {
  const t = useT();
  const router = useRouter();
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const { settings } = useSettings();

  // Schematic for everyone: geography is unreadable in the city core, which is
  // the whole reason transit maps are drawn this way. The true-to-scale version
  // stays available under Gao for anyone who wants it.
  const [layout, setLayout] = useState<MapLayout>("schematic");
  const canSwitchLayout = settings.kiasuLevel === "gao";

  function select(name: string) {
    if (!from) {
      setFrom(name);
      return;
    }
    // Tapping the origin again clears it, rather than trapping someone who
    // mis-tapped into starting over.
    if (name === from) {
      setFrom(undefined);
      return;
    }
    setTo(name);
    router.push(`/route/${encodeURIComponent(from)}/${encodeURIComponent(name)}`);
  }

  const prompt = from ? t("map.pickTo", { station: from }) : t("map.pickFrom");

  return (
    <div className="min-h-dvh">
      <Hud title={t("map.title")} backHref="/" />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-16 pt-5">
        <div className="pixel-box anim-enter flex items-center justify-between gap-3 p-4">
          <p className="text-base leading-relaxed text-fg">{prompt}</p>
          {from && (
            <button
              type="button"
              onClick={() => { setFrom(undefined); setTo(undefined); }}
              className="pixel-btn font-pixel shrink-0 px-3 py-3 text-[11px] uppercase"
            >
              {t("common.clear")}
            </button>
          )}
        </div>

        <div className="anim-enter anim-enter-2">
          <NetworkMap
            /* Remount on a layout change: the coordinate spaces differ, so zoom
               and centre must start fresh rather than be carried across. */
            key={canSwitchLayout ? layout : "schematic"}
            stations={stations}
            edges={edges}
            schematic={schematic}
            schematicExtent={schematicExtent}
            layout={canSwitchLayout ? layout : "schematic"}
            from={from}
            to={to}
            onSelect={select}
            labels={{
              zoomIn: t("map.zoomIn"),
              zoomOut: t("map.zoomOut"),
              reset: t("map.reset"),
              station: t("map.title"),
            }}
          />
        </div>

        {canSwitchLayout && (
          <button
            type="button"
            onClick={() => setLayout((l) => (l === "schematic" ? "geographic" : "schematic"))}
            className="pixel-btn font-pixel min-h-11 px-4 py-3 text-[11px] uppercase"
          >
            {t(layout === "schematic" ? "map.showGeographic" : "map.showSchematic")}
          </button>
        )}

        <p className="text-sm leading-relaxed text-fg-muted">
          {t("map.hint")}
          {canSwitchLayout && layout === "geographic" ? ` ${t("map.geographicNote")}` : ""}
        </p>

        {unplaceable.length > 0 && (
          <p className="pixel-box-sm p-3 text-sm leading-relaxed text-fg-muted">
            {t("map.unplaceable", {
              stations: unplaceable.map((s) => s.name).join(", "),
            })}
          </p>
        )}
      </main>
    </div>
  );
}
