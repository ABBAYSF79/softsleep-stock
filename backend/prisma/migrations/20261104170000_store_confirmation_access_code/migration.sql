-- Hashed codes cannot be recovered: confirmation users must get a new code.
DROP INDEX `ConfirmationUser_accessCodeHash_key` ON `ConfirmationUser`;

-- AlterTable
ALTER TABLE `ConfirmationUser` DROP COLUMN `accessCodeHash`,
    ADD COLUMN `accessCode` VARCHAR(191) NULL;

UPDATE `ConfirmationUser` SET `accessCodeGeneratedAt` = NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ConfirmationUser_accessCode_key` ON `ConfirmationUser`(`accessCode`);
