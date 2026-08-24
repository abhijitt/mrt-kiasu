import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data & credits — MRT Kiasu",
  description: "Every data source behind MRT Kiasu and the licence it is used under.",
  alternates: { canonical: "/attribution" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
