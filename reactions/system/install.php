<?php
if(!defined('BOOM')){ die(); }
/* custom1 = on, custom2 = emoji list (numeric entities joined by |), custom3 = guests may react, custom4 = private chat reactions, custom5 = keep days, custom6 = discovery hint on/off, custom8 = credit link, custom7 = hint max visits */
$ad = array('name' => 'reactions', 'access' => 0, 'custom1' => '1', 'custom2' => '&#128077;|&#10084;&#65039;|&#128514;|&#128558;|&#128546;|&#128545;', 'custom3' => '1', 'custom6' => '1', 'custom8' => '1', 'custom7' => '5');
$mysqli->query("CREATE TABLE IF NOT EXISTS `boom_reactions` (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`msg_type` ENUM('main','private') NOT NULL DEFAULT 'main',
	`msg_id` INT(11) NOT NULL,
	`user_id` INT(11) NOT NULL,
	`emoji` TINYINT UNSIGNED NOT NULL,
	`time` INT(11) NOT NULL DEFAULT 0,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uniq_rx` (`msg_type`, `msg_id`, `user_id`),
	KEY `idx_user_time` (`user_id`, `time`),
	KEY `idx_time` (`time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
?>
