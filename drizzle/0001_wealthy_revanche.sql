ALTER TABLE `layouts` ADD `is_public` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_layouts_public` ON `layouts` (`is_public`);