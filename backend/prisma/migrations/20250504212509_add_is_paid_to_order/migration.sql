/*
  Warnings:

  - You are about to drop the column `paymentStatus` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Order` DROP COLUMN `paymentStatus`,
    ADD COLUMN `isPaid` BOOLEAN NOT NULL DEFAULT false;
