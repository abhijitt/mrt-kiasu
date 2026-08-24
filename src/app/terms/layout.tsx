import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of use — MRT Kiasu",
  description: "An unofficial tool. What it does and does not promise about accuracy.",
  alternates: { canonical: "/terms" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
