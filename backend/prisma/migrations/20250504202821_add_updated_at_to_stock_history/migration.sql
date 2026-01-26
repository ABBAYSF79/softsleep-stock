/*
  Warnings:

  - You are about to alter the column `type` on the `StockHistory` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(0))` to `VarChar(191)`.
  - Added the required column `updatedAt` to the `StockHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `StockHistory` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `type` VARCHAR(191) NOT NULL,
    MODIFY `previousStock` INTEGER NOT NULL DEFAULT 0,
    MODIFY `newStock` INTEGER NOT NULL DEFAULT 0;

-- RenameIndex
ALTER TABLE `StockHistory` RENAME INDEX `StockHistory_userId_fkey` TO `StockHistory_userId_idx`;

-- RenameIndex
ALTER TABLE `StockHistory` RENAME INDEX `StockHistory_variantId_fkey` TO `StockHistory_variantId_idx`;
