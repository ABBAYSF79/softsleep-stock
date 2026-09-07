-- CreateTable
CREATE TABLE `Reservation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referenceNumber` VARCHAR(191) NOT NULL,
    `source` ENUM('ORDER', 'PILLOW_ORDER') NOT NULL,
    `orderId` INTEGER NULL,
    `pillowOrderId` INTEGER NULL,
    `locationId` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'PARTIALLY_FULFILLED', 'FULFILLED', 'RELEASED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `releasedAt` DATETIME(3) NULL,
    `fulfilledAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,

    UNIQUE INDEX `Reservation_referenceNumber_key`(`referenceNumber`),
    UNIQUE INDEX `Reservation_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Reservation_orderId_idx`(`orderId`),
    INDEX `Reservation_pillowOrderId_idx`(`pillowOrderId`),
    INDEX `Reservation_locationId_idx`(`locationId`),
    INDEX `Reservation_status_idx`(`status`),
    INDEX `Reservation_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReservationLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reservationId` INTEGER NOT NULL,
    `pillowId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `fulfilledQuantity` INTEGER NOT NULL DEFAULT 0,
    `releasedQuantity` INTEGER NOT NULL DEFAULT 0,
    `returnedQuantity` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReservationLine_reservationId_idx`(`reservationId`),
    INDEX `ReservationLine_pillowId_idx`(`pillowId`),
    UNIQUE INDEX `ReservationLine_reservationId_pillowId_key`(`reservationId`, `pillowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_pillowOrderId_fkey` FOREIGN KEY (`pillowOrderId`) REFERENCES `PillowOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReservationLine` ADD CONSTRAINT `ReservationLine_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReservationLine` ADD CONSTRAINT `ReservationLine_pillowId_fkey` FOREIGN KEY (`pillowId`) REFERENCES `Pillow`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
