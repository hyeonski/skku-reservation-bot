-- AlterTable
ALTER TABLE `conversation` ADD COLUMN `confirmed_reservation_form` JSON NULL,
    ADD COLUMN `confirmed_reservation_label` VARCHAR(191) NULL,
    ADD COLUMN `last_application_state` JSON NULL;
