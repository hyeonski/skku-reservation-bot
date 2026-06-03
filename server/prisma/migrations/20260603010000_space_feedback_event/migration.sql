-- CreateTable
CREATE TABLE `space_feedback_event` (
    `id` CHAR(36) NOT NULL,
    `client_id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NOT NULL,
    `space_code` VARCHAR(40) NOT NULL,
    `event_type` ENUM('rejected_candidate') NOT NULL,
    `date` VARCHAR(10) NULL,
    `start_time` VARCHAR(5) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `space_feedback_event_client_id_space_code_event_type_created_at_idx`(`client_id`, `space_code`, `event_type`, `created_at`),
    INDEX `space_feedback_event_client_id_conversation_id_space_code_event_type_idx`(`client_id`, `conversation_id`, `space_code`, `event_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `space_feedback_event` ADD CONSTRAINT `space_feedback_event_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
