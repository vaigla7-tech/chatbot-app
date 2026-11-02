/**
 * Idempotent seed: safe to run on every deploy. It only creates missing rows and
 * never overwrites content that administrators have edited.
 */
import { PrismaClient } from "@prisma/client";
import { LANGUAGE_CODES, LANGUAGES } from "../src/lib/languages";
import { DEFAULT_CATEGORIES } from "../src/lib/intent";
import { DEFAULT_SUGGESTED_QUESTIONS as SUGGESTED_QUESTIONS } from "../src/lib/defaults";

const prisma = new PrismaClient();

// Demonstration FAQs: about the assistant itself, not Lendermarket product facts.
// Seeded as DRAFT examples so they are never used in live answers until reviewed.
const EXAMPLE_FAQS = [
  {
    group: "example-assistant-account-access",
    question: "[Example] Can this assistant access or change my investor account?",
    answer:
      "No. The assistant provides general information only and cannot see or change any account. For account-specific questions, contact Lendermarket Support through a verified channel.",
    category: "troubleshooting",
  },
  {
    group: "example-assistant-advice",
    question: "[Example] Does the assistant give personal investment advice?",
    answer:
      "No. The assistant explains how the platform works using approved documentation. It does not recommend investments or assess whether an investment is suitable for you.",
    category: "general-platform",
  },
];

async function main() {
  for (const [i, code] of LANGUAGE_CODES.entries()) {
    await prisma.supportedLanguage.upsert({
      where: { code },
      create: { code, name: LANGUAGES[code].name, nativeName: LANGUAGES[code].nativeName, sortOrder: i },
      update: {},
    });
  }

  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await prisma.knowledgeCategory.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, sortOrder: i },
      update: {},
    });
  }

  for (const code of LANGUAGE_CODES) {
    for (const [i, text] of SUGGESTED_QUESTIONS[code].entries()) {
      await prisma.suggestedQuestion.upsert({
        where: { position_language: { position: i + 1, language: code } },
        create: { position: i + 1, language: code, text },
        update: {},
      });
    }
  }

  const defaults: Record<string, object> = {
    support: { contactUrl: null, requestUrl: null, email: null },
    analytics: { retentionDays: 180, feedbackEnabled: true },
    chat: { maxMessageLength: 1500, maxHistoryMessages: 10, systemPromptAddendum: "", minRelevance: 0.3 },
    languages: { enabled: [...LANGUAGE_CODES] },
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.systemConfiguration.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  if ((await prisma.aIProviderConfig.count()) === 0) {
    const provider = process.env.AI_PROVIDER === "openai" ? "openai" : "anthropic";
    const model = process.env.AI_MODEL || (provider === "anthropic" ? "claude-opus-5-5" : "");
    if (model) {
      await prisma.aIProviderConfig.create({
        data: { providerName: provider, modelName: model, active: true, settings: { maxOutputTokens: 1500, effort: "low", timeoutMs: 45000 } },
      });
    }
  }

  for (const faq of EXAMPLE_FAQS) {
    const category = await prisma.knowledgeCategory.findUniqueOrThrow({ where: { slug: faq.category } });
    await prisma.fAQ.upsert({
      where: { translationGroupId_language: { translationGroupId: faq.group, language: "en" } },
      create: {
        translationGroupId: faq.group,
        language: "en",
        question: faq.question,
        answer: faq.answer,
        categoryId: category.id,
        approvalStatus: "DRAFT",
        isExample: true,
      },
      update: {},
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
