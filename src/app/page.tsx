import { ChatApp } from "@/components/chat/chat-app";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <ChatApp mode="page" preferredLanguage={lang ?? null} />;
}
