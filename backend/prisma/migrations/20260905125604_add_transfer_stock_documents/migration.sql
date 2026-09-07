-- CreateTable
CREATE TABLE `Transfer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referenceNumber` VARCHAR(191) NOT NULL,
    `sourceLocationId` INTEGER NOT NULL,
    `destinationLocationId` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `reason` VARCHAR(191) NULL,
    `createdById` INTEGER NULL,
    `dispatchedById` INTEGER NULL,
    `completedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dispatchedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Transfer_referenceNumber_key`(`referenceNumber`),
    INDEX `Transfer_sourceLocationId_idx`(`sourceLocationId`),
    INDEX `Transfer_destinationLocationId_idx`(`destinationLocationId`),
    INDEX `Transfer_status_idx`(`status`),
    INDEX `Transfer_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransferLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transferId` INTEGER NOT NULL,
    `pillowId` INTEGER NOT NULL,
    `sentQuantity` INTEGER NOT NULL DEFAULT 0,
    `receivedQuantity` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TransferLine_transferId_idx`(`transferId`),
    INDEX `TransferLine_pillowId_idx`(`pillowId`),
    UNIQUE INDEX `TransferLine_transferId_pillowId_key`(`transferId`, `pillowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockDocument` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `documentNumber` VARCHAR(191) NOT NULL,
    `type` ENUM('BON_SORTIE', 'BON_ENTREE') NOT NULL,
    `status` ENUM('DRAFT', 'VALIDATED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `transferId` INTEGER NULL,
    `locationId` INTEGER NOT NULL,
    `createdById` INTEGER NULL,
    `validatedById` INTEGER NULL,
    `reason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validatedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,

    UNIQUE INDEX `StockDocument_documentNumber_key`(`documentNumber`),
    INDEX `StockDocument_type_idx`(`type`),
    INDEX `StockDocument_status_idx`(`status`),
    INDEX `StockDocument_transferId_idx`(`transferId`),
    INDEX `StockDocument_locationId_idx`(`locationId`),
    INDEX `StockDocument_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockDocumentLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockDocumentId` INTEGER NOT NULL,
    `pillowId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockDocumentLine_stockDocumentId_idx`(`stockDocumentId`),
    INDEX `StockDocumentLine_pillowId_idx`(`pillowId`),
    UNIQUE INDEX `StockDocumentLine_stockDocumentId_pillowId_key`(`stockDocumentId`, `pillowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentSequence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `lastNumber` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DocumentSequence_type_year_key`(`type`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_sourceLocationId_fkey` FOREIGN KEY (`sourceLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_destinationLocationId_fkey` FOREIGN KEY (`destinationLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_dispatchedById_fkey` FOREIGN KEY (`dispatchedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_completedById_fkey` FOREIGN KEY (`completedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferLine` ADD CONSTRAINT `TransferLine_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `Transfer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferLine` ADD CONSTRAINT `TransferLine_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockDocument` ADD CONSTRAINT `StockDocument_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `Transfer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockDocument` ADD CONSTRAINT `StockDocument_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockDocument` ADD CONSTRAINT `StockDocument_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockDocument` ADD CONSTRAINT `StockDocument_validatedById_fkey` FOREIGN KEY (`validatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockDocumentLine` ADD CONSTRAINT `StockDocumentLine_stockDocumentId_fkey` FOREIGN KEY (`stockDocumentId`) REFERENCES `StockDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockDocumentLine` ADD CONSTRAINT `StockDocumentLine_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
