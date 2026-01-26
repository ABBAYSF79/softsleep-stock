/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `StockHistory` table. All the data in the column will be lost.
  - You are about to alter the column `type` on the `StockHistory` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(3))`.

*/
-- AlterTable
ALTER TABLE `Order` ADD COLUMN `paymentStatus` ENUM('NOT_PAID', 'PAID') NOT NULL DEFAULT 'NOT_PAID';

-- AlterTable
ALTER TABLE `StockHistory` DROP COLUMN `updatedAt`,
    MODIFY `type` ENUM('INITIAL', 'ORDER', 'RETURN', 'ADJUSTMENT') NOT NULL,
    ALTER COLUMN `previousStock` DROP DEFAULT,
    ALTER COLUMN `newStock` DROP DEFAULT;
