# MRT Kiasu

A mobile-first companion for the Singapore MRT. It tells you **which door to stand at** so you step off nearest the escalator, lift, stairs, your exit, or your transfer — because those seconds add up.

No login. No account. No tracking. Settings live in your browser only.

## The one rule

**Nothing here is made up, and nothing is presented as more certain than it is.**
Every figure traces to a citable source or is computed from one, and the
precision of what we show always matches the precision of what we know.

This matters because the core feature has **no public data source**. Verified
against LTA DataMall (all 33 APIs), data.gov.sg, SMRT and SBS Transit: no
official dataset maps train doors or carriages to escalators, lifts, stairs or
exits, and no official door numbering is displayed on platforms.

So door positions carry an explicit confidence tier (see [Coverage](#coverage)).
Estimates are derived from real exit coordinates rather than invented, but they
are labelled as estimates everywhere they appear and are deliberately reported
at car level, because that is as precise as the method honestly gets.

`npm run validate-data` enforces this in CI and before every build. It fails if
any position — surveyed or estimated — lacks a source, lacks a confidence level,
names a door that cannot exist on that line's trains, or points at an exit that
LTA's dataset says does not exist.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then add your LTA AccountKey
npm run dev
```

Get a free AccountKey at [datamall.lta.gov.sg](https://datamall.lta.gov.sg/). The app works without one — live crowd levels and service alerts simply degrade to "unavailable".

```bash
npm test             # unit tests (door maths, API caching)
npm run validate-data # data integrity gate
npm run import:exits  # refresh station exits from data.gov.sg
```

## Languages

All four of Singapore's official languages: English, Chinese, Malay and Tamil. No
user-facing string is written inline anywhere in the app — every one lives in
`src/i18n/messages/<locale>.json`, so a fifth language is one new file plus one
entry in `src/i18n/config.ts`.

The language button sits beside Settings on every screen rather than inside
Settings, because someone who landed on a page in a language they cannot read
needs the switch visible, not two taps deep. On first visit the locale follows
the browser's own language preference; after that the choice is remembered.

`src/i18n/i18n.test.ts` fails the build if a catalogue is missing a key, has a
stray one, drops a `{placeholder}`, or is left as an English copy.

UI strings are hand-written. **Content** — the 175 Wikipedia station summaries
and infobox values — is machine translated via OpenRouter:

```bash
export OPENROUTER_API_KEY=sk-or-...      # or add it to .env.local
npm run translate                         # resumes from cache; safe to rerun
npm run translate -- --dry-run            # show what would be sent
```

Defaults to `anthropic/claude-opus-5`; override with `OPENROUTER_MODEL`. It
translates the 152 *distinct* strings rather than 175 stations, because values
like "Underground" repeat, and caches per string so a failed run resumes rather
than paying twice. Machine-translated summaries are labelled as such in the UI,
and the English original stays the source of truth with a link to its article.

Neither the hand-written catalogues nor the machine translations have been
reviewed by native speakers — worth a pass before launch.

## Data sources

| Data | Source | Notes |
|---|---|---|
| Station codes, names (EN/ZH), lines | [LTA Train Station Codes and Chinese Names](https://datamall.lta.gov.sg/content/datamall/en/static-data.html) | Official. 213 stations |
| Station exits | [LTA MRT Station Exit](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view) via data.gov.sg | Singapore Open Data Licence. 760 exits. No API key needed |
| Exit landmarks | OpenStreetMap via Overpass, ODbL | Computed: nearest named places within 350 m of each exit. 3,727 pairs |
| Live crowd density | LTA DataMall `PCDRealTime` | Refreshes every 10 min |
| Service alerts | LTA DataMall `TrainServiceAlerts` | Ad hoc |
| Lift outages | LTA DataMall `v2/FacilitiesMaintenance` | Lifts only — LTA publishes no escalator outages |
| Opening dates | Wikidata P1619, keyed by official station code P296 | Wikipedia infoboxes fill the stations Wikidata lacks |
| Station descriptions, depth | Wikipedia page summaries and infoboxes | 175 stations. Each links to its article |
| Train car/door geometry | Wikipedia rolling-stock articles + LTA press releases | Cited in `src/lib/lines.ts` |
| Door positions (verified) | Field survey | No public source exists — see above |
| Door positions (estimated) | Computed from LTA exit coordinates + line bearing | Car length 23.65 m / 22.8 m, from rolling-stock infoboxes |

### Known data gaps

- **Punggol Coast (NE18)** and **Hume (DT4)** are absent from LTA's exit dataset despite having opened. Surfaced in the UI rather than hidden.
- **LRT fleets** have no sourced car/door geometry, so those lines are routable and browsable but get no door guidance at all — `doorsPerTrain` returns `null` and the door maths throws rather than guessing.
- **First/last train times** are not yet integrated. SBS Transit publishes scrapable HTML for its lines; SMRT's equivalent is a JS-rendered SPA with no API.
- **Opening dates are per station, not per platform.** At an interchange, the later line's platforms opened after the date shown; the UI says so.

## How positions are stored

The key design decision: a position is stored **once per physical platform** as a `doorIndex` counted from the platform's reference end — the end facing the lower station code (the HarbourFront end on the NEL).

Car numbers are *derived* per direction of travel, because the same physical escalator is "car 1" heading one way and "car 6" heading the other. One survey therefore serves both directions, and the mirroring lives in one tested function (`src/lib/doors.ts`) rather than being baked into the data.

The UI never shows a bare door number — MRT platforms carry no door numbering, so "door 14" would refer to nothing you can see. It says **"Car 4 of 6 · 2nd door"**, or just **"Car 4 of 6"** when the position is an estimate.

The platform diagram is drawn at a **fixed height** with width following the
train's real length, so a 3-car Circle Line train and a 6-car North South train
render at the same scale rather than one being squashed to fit.

## API caching

One AccountKey lives on the server and never reaches the client (`server-only`, verified against the build output). Three caching layers keep us well inside DataMall's limits:

1. An explicit TTL cache keyed per endpoint and line, with TTLs matched to how often LTA actually refreshes each dataset.
2. Single-flight collapsing, so a burst of concurrent misses costs one upstream call.
3. A stale fallback that serves the last good payload if DataMall errors, rather than retry-storming.

Route handlers add `s-maxage` so the CDN absorbs repeat traffic too. `src/lib/lta.test.ts` asserts all of this: 10 sequential reads and 25 concurrent reads each produce exactly one upstream call.

## Coverage

All **213 operational MRT and LRT stations**, imported from LTA's official
station code file. Every station has an opening date, and 211 of 213 have exit
data (Punggol Coast and Hume are not yet in LTA's exit dataset).

Journey planning covers the whole network, including the Changi Airport and
Circle Line Extension branches and the LRT loops.

Door positions come in three tiers, and the UI never blurs them:

| Tier | Source | Shown as |
|---|---|---|
| Verified | Someone checked on the platform | Car **and** door |
| Candidate | Derived from OSM platform geometry | Car and door, flagged |
| Estimate | Exit coordinates projected onto the line's bearing | **Car only**, flagged |

Estimates are typed `exit`, not `escalator`. The projection locates where an
exit *surfaces*; it cannot tell an escalator from a lift or stairs. That is why
a commuter's escalator/lift/stairs preference only changes the answer where a
survey exists — and the route page says so explicitly rather than implying the
preference was applied.

### Escalator direction

A surveyed escalator must record which way it runs (`up`, `down`, or
`reversible`). This is not bookkeeping: **a down-only escalator is worse than
useless to someone getting off a train**, and routing them to one would be
actively wrong. `servesAlighting()` excludes down-only escalators from exit
guidance, and the data gate rejects a surveyed escalator with no direction.

Stairs and lifts serve both directions inherently, so the field applies to
escalators only.

Estimates exist for 169 stations. They are accurate to roughly ±30 m, which is
why they name a car and not a door — about half of them clamp to one end of the
train. They are a starting point for surveying, not a substitute for it.

## Finding your exit

The route page's exit section is searchable by **landmark**, not by exit letter
— nobody knows they want "Exit C", they know they want Junction 8. Typing a mall,
hospital or school name surfaces the exits that serve it, sorted by distance;
picking one re-targets the door guidance above to that exit.

## Contributing a survey

Run the app, open a station, and tap "Survey this platform". Stand on the platform, find the escalator, tap the door it lines up with. In development this writes straight to `src/data/positions.json`; in production it hands you the JSON to submit for review — an open write endpoint would let anyone poison the one thing this app promises is trustworthy.

## Legal and informational pages

`/about`, `/privacy`, `/terms` and `/attribution` are linked from the home and
settings footers and from each other.

**No cookie banner is needed, and adding one would be theatre.** The app sets no
cookies at all. The only browser storage is three `localStorage` keys holding
your language, theme and avatar preferences — functional, not tracking, so it
falls outside consent requirements under both the PDPA and GDPR. The privacy
page says so explicitly rather than leaving people to wonder.

Personal data is limited to the optional name and email on the report form, which
is why the privacy notice exists: Singapore's PDPA requires notifying purpose
before collecting it.

`/terms` is authoritative in English. Machine translation is fine for a station
description and not for a liability disclaimer, and the page says which governs.

> These pages are a good-faith baseline written by a developer, not a lawyer.
> Have them reviewed before this carries real traffic — particularly the ODbL
> share-alike position on the derived landmark dataset.

## Configuration

| Variable | Purpose |
|---|---|
| `LTA_ACCOUNT_KEY` | LTA DataMall. Without it, live crowding and alerts degrade to "unavailable" |
| `OPENROUTER_API_KEY` | Only needed to re-run `npm run translate` |
| `REPORT_WEBHOOK_URL` | Where error reports are POSTed. Unset in production means the form hands the user their text to copy |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for sitemap, robots and OG tags. Falls back to the Vercel host |

## Attribution

Contains information from LTA accessed via data.gov.sg and LTA DataMall, made available under the [Singapore Open Data Licence](https://data.gov.sg/open-data-licence). Landmark data is derived from OpenStreetMap, © OpenStreetMap contributors, under the [ODbL](https://opendatacommons.org/licenses/odbl/); the derived dataset is likewise available under ODbL. Station descriptions and facts come from Wikipedia (CC BY-SA 4.0) and Wikidata (CC0).
