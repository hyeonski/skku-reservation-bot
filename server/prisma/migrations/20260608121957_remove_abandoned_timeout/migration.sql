-- 미사용 enum 값 abandoned_timeout 제거 (세팅 코드 경로 없음).
-- ALTER: conversation.status enum 축소.
ALTER TABLE `conversation` MODIFY `status` ENUM('active', 'completed', 'abandoned_user') NOT NULL DEFAULT 'active';
