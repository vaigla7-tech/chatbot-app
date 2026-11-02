// Deterministic environment for unit tests: no real keys, no real database.
process.env.ADMIN_AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.EMBEDDING_PROVIDER = "none";
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
