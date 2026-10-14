// Test environment. Integration tests use ONLY TEST_DATABASE_URL (never the dev/prod DATABASE_URL).
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.FILE_STORAGE_DIR ??= "./storage-test";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
