import type { Metadata } from "next";
import "./globals.css";
import { PostHogProvider } from "@/app/components/PostHogProvider";

export const metadata: Metadata = {
  title: "Campus Macros — Eat Well on a College Budget",
  description:
    "Personalized meal plans for college students that hit your macros within your budget — recipes, grocery lists, and calorie targeting included.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Background comes from globals.css (white washed with forest-green light). */}
      <body className="antialiased text-gray-900">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
