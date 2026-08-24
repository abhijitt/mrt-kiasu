import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — MRT Kiasu",
  description: "No accounts, no tracking, no cookies. What stays on your device and what a report sends.",
  alternates: { canonical: "/privacy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
