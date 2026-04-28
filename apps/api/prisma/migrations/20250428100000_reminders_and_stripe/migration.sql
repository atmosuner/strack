-- ── T11: Push notifications & reminders ──

-- AlterTable: add push/reminder fields to User
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateTable: PushToken
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'expo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ReminderPref
CREATE TABLE "ReminderPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minutesBefore" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReminderPref_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReminderPref_userId_key" ON "ReminderPref"("userId");
ALTER TABLE "ReminderPref" ADD CONSTRAINT "ReminderPref_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: SentReminder (idempotency)
CREATE TABLE "SentReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "occurrenceDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SentReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SentReminder_userId_lessonId_occurrenceDate_key"
  ON "SentReminder"("userId", "lessonId", "occurrenceDate");

-- ── T12: Stripe payments ──

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- AlterTable: add Stripe fields to Household
ALTER TABLE "Household" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Household" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Household" ADD COLUMN "featureFlags" TEXT NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "Household_stripeSubscriptionId_key" ON "Household"("stripeSubscriptionId");

-- CreateTable: StripePayment
CREATE TABLE "StripePayment" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "stripePaymentIntent" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StripePayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StripePayment_stripeSessionId_key" ON "StripePayment"("stripeSessionId");
CREATE INDEX "StripePayment_householdId_idx" ON "StripePayment"("householdId");
ALTER TABLE "StripePayment" ADD CONSTRAINT "StripePayment_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
