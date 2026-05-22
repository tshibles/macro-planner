import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macro Planner — Eat Well on a College Budget",
  description:
    "Generate a personalized weekly meal plan tailored to your fitness goals, dietary needs, and college budget.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-950 text-white">{children}</body>
    </html>
  );
}
