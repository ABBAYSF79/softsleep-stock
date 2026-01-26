-- AlterTable
ALTER TABLE `StockHistory` ALTER COLUMN `previousStock` DROP DEFAULT,
    ALTER COLUMN `newStock` DROP DEFAULT,
    ALTER COLUMN `userId` DROP DEFAULT;
