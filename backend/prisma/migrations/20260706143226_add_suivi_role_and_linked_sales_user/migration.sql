-- AlterTable
ALTER TABLE `order` ADD COLUMN `enteredByUserId` INTEGER NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `linkedSalesUserId` INTEGER NULL,
    MODIFY `role` ENUM('ADMIN', 'SALES', 'LIVREUR', 'SUIVI') NOT NULL DEFAULT 'SALES';

-- CreateIndex
CREATE INDEX `Order_enteredByUserId_idx` ON `Order`(`enteredByUserId`);

-- CreateIndex
CREATE INDEX `User_linkedSalesUserId_idx` ON `User`(`linkedSalesUserId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_linkedSalesUserId_fkey` FOREIGN KEY (`linkedSalesUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_enteredByUserId_fkey` FOREIGN KEY (`enteredByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
