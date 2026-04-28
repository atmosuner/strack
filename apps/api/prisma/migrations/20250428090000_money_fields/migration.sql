-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- AlterTable: add paymentStatus to Lesson
ALTER TABLE "Lesson" ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- AlterTable: add creditBalance to Provider
ALTER TABLE "Provider" ADD COLUMN "creditBalance" INTEGER NOT NULL DEFAULT 0;
