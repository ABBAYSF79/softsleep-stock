-- AlterTable
ALTER TABLE `ConfirmationUser` ADD COLUMN `accessCodeHash` VARCHAR(191) NULL,
    ADD COLUMN `accessCodeGeneratedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ConfirmationUser_accessCodeHash_key` ON `ConfirmationUser`(`accessCodeHash`);
