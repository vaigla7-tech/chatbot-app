import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata: Metadata = { title: "Lendermarket AI Assistant" };

/** Rendered inside the embeddable iframe (see public/embed.js). */
export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <ChatApp mode="widget" preferredLanguage={lang ?? null} />;
}
