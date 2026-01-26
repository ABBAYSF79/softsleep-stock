-- AlterTable
ALTER TABLE `Order` ADD COLUMN `confirmationUserId` INTEGER NULL;

-- CreateTable
CREATE TABLE `ConfirmationUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `salesmanId` INTEGER NOT NULL,
    `linkedSalesUserId` INTEGER NULL,

    INDEX `ConfirmationUser_salesmanId_idx`(`salesmanId`),
    INDEX `ConfirmationUser_linkedSalesUserId_idx`(`linkedSalesUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ConfirmationUser` ADD CONSTRAINT `ConfirmationUser_salesmanId_fkey` FOREIGN KEY (`salesmanId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConfirmationUser` ADD CONSTRAINT `ConfirmationUser_linkedSalesUserId_fkey` FOREIGN KEY (`linkedSalesUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_confirmationUserId_fkey` FOREIGN KEY (`confirmationUserId`) REFERENCES `ConfirmationUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
