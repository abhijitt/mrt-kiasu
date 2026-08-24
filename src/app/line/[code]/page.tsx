import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LINES, LINE_ORDER, type LineCode } from "@/lib/lines";
import { stationsOnLine } from "@/lib/stations";
import { LineScreen } from "./LineScreen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const line = LINES[code.toUpperCase() as LineCode];
  if (!line) return { title: "Not found" };

  const count = stationsOnLine(line.code).length;
  const title = `${line.name} — MRT Kiasu`;
  const description = `All ${count} stations on Singapore's ${line.name}, with exits, landmarks and door guidance.`;

  return {
    title,
    description,
    alternates: { canonical: `/line/${line.code}` },
    openGraph: { title, description, type: "article" },
  };
}

export function generateStaticParams() {
  return LINE_ORDER.map((code) => ({ code }));
}

export default async function LinePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const lineCode = code.toUpperCase() as LineCode;
  const line = LINES[lineCode];
  if (!line) notFound();

  return (
    <LineScreen
      code={lineCode}
      shortName={line.shortName}
      colorVar={line.colorVar}
      inkVar={line.inkVar}
      operator={line.operator}
      train={line.train}
      trainSource={line.trainSource}
      stations={stationsOnLine(lineCode).map((s) => ({
        code: s.code,
        name: s.name,
        isInterchange: s.interchanges.length > 0,
      }))}
    />
  );
}
