/*
  Warnings:

  - Added the required column `newStock` to the `StockHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `previousStock` to the `StockHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `StockHistory` table without a default value. This is not possible if the table is not empty.

*/
-- First, add the columns with default values that match the existing data
ALTER TABLE `StockHistory` 
ADD COLUMN `previousStock` INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN `newStock` INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN `userId` INTEGER DEFAULT 1 NOT NULL;

-- Add the foreign key constraint
ALTER TABLE `StockHistory` 
ADD CONSTRAINT `StockHistory_userId_fkey` 
FOREIGN KEY (`userId`) 
REFERENCES `User`(`id`) 
ON DELETE RESTRICT 
ON UPDATE CASCADE;
