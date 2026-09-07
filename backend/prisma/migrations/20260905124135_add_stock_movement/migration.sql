-- CreateTable
CREATE TABLE `StockMovement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pillowId` INTEGER NOT NULL,
    `locationId` INTEGER NOT NULL,
    `type` ENUM('INITIAL', 'SUPPLY', 'SALE', 'RESERVATION', 'RELEASE', 'RETURN', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `previousPhysical` INTEGER NOT NULL,
    `newPhysical` INTEGER NOT NULL,
    `previousPresentation` INTEGER NOT NULL,
    `newPresentation` INTEGER NOT NULL,
    `previousReserved` INTEGER NOT NULL,
    `newReserved` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` INTEGER NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_pillowId_idx`(`pillowId`),
    INDEX `StockMovement_locationId_idx`(`locationId`),
    INDEX `StockMovement_type_idx`(`type`),
    INDEX `StockMovement_createdAt_idx`(`createdAt`),
    INDEX `StockMovement_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    INDEX `StockMovement_pillowId_locationId_createdAt_idx`(`pillowId`, `locationId`, `createdAt`),
    INDEX `StockMovement_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
