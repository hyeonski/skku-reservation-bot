ALTER TABLE `conversation`
  ADD `deleted_at` DATETIME(3) NULL;

CREATE INDEX `conversation_client_id_deleted_at_updated_at_idx`
  ON `conversation`(`client_id`, `deleted_at`, `updated_at`);
