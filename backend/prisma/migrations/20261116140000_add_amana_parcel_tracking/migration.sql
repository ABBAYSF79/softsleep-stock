-- CreateTable
CREATE TABLE `AmanaParcelTracking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `status` ENUM('SORTI_A_DESTINATION', 'ENVOI_ARRIVE', 'SORTI_PAR_FACTEUR', 'PRIS_EN_CHARGE', 'A_RECUPERER', 'ENVOI_EN_RETARD', 'REFUSE_PAR_CLIENT', 'RETARD_RESOLU', 'RETARD_ARRIVE_DESTINATION', 'LIVREE') NOT NULL,
    `initialStatusAt` DATETIME(3) NOT NULL,
    `lastStatusAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AmanaParcelTracking_orderId_key`(`orderId`),
    INDEX `AmanaParcelTracking_status_idx`(`status`),
    INDEX `AmanaParcelTracking_lastStatusAt_idx`(`lastStatusAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AmanaParcelTrackingHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `amanaParcelTrackingId` INTEGER NOT NULL,
    `oldStatus` ENUM('SORTI_A_DESTINATION', 'ENVOI_ARRIVE', 'SORTI_PAR_FACTEUR', 'PRIS_EN_CHARGE', 'A_RECUPERER', 'ENVOI_EN_RETARD', 'REFUSE_PAR_CLIENT', 'RETARD_RESOLU', 'RETARD_ARRIVE_DESTINATION', 'LIVREE') NULL,
    `newStatus` ENUM('SORTI_A_DESTINATION', 'ENVOI_ARRIVE', 'SORTI_PAR_FACTEUR', 'PRIS_EN_CHARGE', 'A_RECUPERER', 'ENVOI_EN_RETARD', 'REFUSE_PAR_CLIENT', 'RETARD_RESOLU', 'RETARD_ARRIVE_DESTINATION', 'LIVREE') NOT NULL,
    `changedAt` DATETIME(3) NOT NULL,
    `changedByUserId` INTEGER NULL,
    `note` TEXT NULL,

    INDEX `AmanaParcelTrackingHistory_amanaParcelTrackingId_changedAt_idx`(`amanaParcelTrackingId`, `changedAt`),
    INDEX `AmanaParcelTrackingHistory_changedByUserId_idx`(`changedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AmanaParcelTracking` ADD CONSTRAINT `AmanaParcelTracking_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AmanaParcelTrackingHistory` ADD CONSTRAINT `AmanaParcelTrackingHistory_amanaParcelTrackingId_fkey` FOREIGN KEY (`amanaParcelTrackingId`) REFERENCES `AmanaParcelTracking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AmanaParcelTrackingHistory` ADD CONSTRAINT `AmanaParcelTrackingHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
