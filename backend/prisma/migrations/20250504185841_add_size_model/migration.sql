/*
  Warnings:

  - You are about to drop the column `size` on the `ProductVariant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `ProductVariant` DROP COLUMN `size`,
    ADD COLUMN `sizeId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Size` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `length` DECIMAL(10, 2) NOT NULL,
    `width` DECIMAL(10, 2) NOT NULL,
    `height` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Size_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_sizeId_fkey` FOREIGN KEY (`sizeId`) REFERENCES `Size`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
