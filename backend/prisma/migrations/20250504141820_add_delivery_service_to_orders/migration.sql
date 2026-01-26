-- AlterTable
ALTER TABLE `Order` ADD COLUMN `deliveryServiceId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_deliveryServiceId_fkey` FOREIGN KEY (`deliveryServiceId`) REFERENCES `DeliveryService`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
