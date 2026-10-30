-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jid" TEXT NOT NULL,
    "lid" TEXT,
    "phone" TEXT NOT NULL,
    "primaryName" TEXT NOT NULL,
    "aliases" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "sensitiveTopics" TEXT NOT NULL DEFAULT '',
    "humorScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userJid" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFact_userJid_fkey" FOREIGN KEY ("userJid") REFERENCES "UserProfile" ("jid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userJid" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RawMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userJid" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BotLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lesson" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BurnedJoke" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "remoteJid" TEXT NOT NULL,
    "creatorJid" TEXT NOT NULL,
    "mentionedJids" TEXT NOT NULL DEFAULT '[]',
    "message" TEXT NOT NULL,
    "targetTime" DATETIME NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_jid_key" ON "UserProfile"("jid");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_lid_key" ON "UserProfile"("lid");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_phone_key" ON "UserProfile"("phone");

-- CreateIndex
CREATE INDEX "UserFact_expiresAt_idx" ON "UserFact"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserFact_userJid_clave_key" ON "UserFact"("userJid", "clave");

-- CreateIndex
CREATE INDEX "MessageEmbedding_createdAt_idx" ON "MessageEmbedding"("createdAt");

-- CreateIndex
CREATE INDEX "RawMessage_createdAt_idx" ON "RawMessage"("createdAt");

-- CreateIndex
CREATE INDEX "BotLesson_createdAt_idx" ON "BotLesson"("createdAt");

-- CreateIndex
CREATE INDEX "BurnedJoke_createdAt_idx" ON "BurnedJoke"("createdAt");

-- CreateIndex
CREATE INDEX "Reminder_targetTime_completed_idx" ON "Reminder"("targetTime", "completed");
