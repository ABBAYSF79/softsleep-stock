-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('ADMIN', 'SALES', 'LIVREUR') NOT NULL DEFAULT 'SALES';

-- CreateTable
CREATE TABLE `UserDeliveryService` (
    `userId` INTEGER NOT NULL,
    `deliveryServiceId` INTEGER NOT NULL,

    INDEX `UserDeliveryService_deliveryServiceId_idx`(`deliveryServiceId`),
    PRIMARY KEY (`userId`, `deliveryServiceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserDeliveryService` ADD CONSTRAINT `UserDeliveryService_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDeliveryService` ADD CONSTRAINT `UserDeliveryService_deliveryServiceId_fkey` FOREIGN KEY (`deliveryServiceId`) REFERENCES `DeliveryService`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
