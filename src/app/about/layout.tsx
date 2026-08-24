import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — MRT Kiasu",
  description: "What MRT Kiasu is, how sure it is about each door position, and why none of it is invented.",
  alternates: { canonical: "/about" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
