-- CreateTable
CREATE TABLE `OrderFollowUp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NULL,
    `pillowOrderId` INTEGER NULL,
    `content` TEXT NOT NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderFollowUp_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `OrderFollowUp_pillowOrderId_createdAt_idx`(`pillowOrderId`, `createdAt`),
    INDEX `OrderFollowUp_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrderFollowUp` ADD CONSTRAINT `OrderFollowUp_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderFollowUp` ADD CONSTRAINT `OrderFollowUp_pillowOrderId_fkey` FOREIGN KEY (`pillowOrderId`) REFERENCES `PillowOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderFollowUp` ADD CONSTRAINT `OrderFollowUp_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
