<?php
if(!defined('BOOM')){ die(); }
/* Reactions helpers
 * custom1 = on (1/0), custom2 = emoji list as numeric HTML entities joined by "|" (ASCII only, safe in utf8mb3),
 * custom3 = guests may react (1/0), custom4 = reactions in private chats (1/0), custom5 = keep reactions N days,
 * custom6 = "hold or hover a message to react" hint (1/0, empty = on),
 * custom8 = show the small credit link (M Kashif on GitHub + chatnoregister.com) in the reactions sheet (1/0, empty = on),
 * custom7 = hint: show on at most N browser sessions until the user reacts or taps x (1-50, empty = 5)
 */
function brxDefaultEmojis(){
	return '&#128077;|&#10084;&#65039;|&#128514;|&#128558;|&#128546;|&#128545;';
}
function brxCfg($a){
	$i = function($k, $d) use ($a){ return (isset($a[$k]) && $a[$k] !== '' && $a[$k] !== null) ? (int)$a[$k] : $d; };
	$raw = (isset($a['custom2']) && trim((string)$a['custom2']) !== '') ? (string)$a['custom2'] : brxDefaultEmojis();
	$list = brxParseList($raw);
	if(empty($list)){ $list = brxParseList(brxDefaultEmojis()); }
	return array(
		'on' => $i('custom1', 1) === 1 ? 1 : 0,
		'emojis' => $list,
		'guest' => $i('custom3', 1) === 1 ? 1 : 0,
		'priv' => $i('custom4', 1) === 1 ? 1 : 0,
		'days' => max(1, min(365, $i('custom5', 30))),
		'hint' => $i('custom6', 1) === 1 ? 1 : 0,
		'hintmax' => max(1, min(50, $i('custom7', 5))),
		'credit' => $i('custom8', 1) === 1 ? 1 : 0,
	);
}
function brxParseList($raw){
	$out = array();
	foreach(explode('|', $raw) as $e){
		$e = trim(html_entity_decode($e, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
		if($e === ''){ continue; }
		$out[] = $e;
		if(count($out) >= 10){ break; }
	}
	return $out;
}
/* user input (raw emoji separated by spaces, commas or |) -> stored entity string */
function brxEncodeList($input){
	$parts = preg_split('/[\s,|]+/u', (string)$input, -1, PREG_SPLIT_NO_EMPTY);
	$out = array();
	foreach($parts as $p){
		$p = html_entity_decode($p, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		if($p === '' || mb_strlen($p, 'UTF-8') > 12 || preg_match('/[<>"\'&;]/', $p)){ continue; }
		$out[] = mb_encode_numericentity($p, array(0x80, 0x10FFFF, 0, 0x1FFFFF), 'UTF-8');
		if(count($out) >= 10){ break; }
	}
	return implode('|', $out);
}
function brxIds($raw, $max = 80){
	$ids = array();
	foreach(explode(',', (string)$raw) as $v){
		$v = (int)$v;
		if($v > 0){ $ids[$v] = $v; }
		if(count($ids) >= $max){ break; }
	}
	return array_values($ids);
}
/* keep only message ids this user may see. main: messages of the room the user is in. private: user is sender or receiver */
function brxAllowed($type, $ids){
	global $mysqli, $data;
	if(empty($ids)){ return array(); }
	$in = implode(',', array_map('intval', $ids));
	$me = (int)$data['user_id'];
	if($type === 'private'){
		$q = $mysqli->query("SELECT id FROM boom_private WHERE id IN ($in) AND (hunter = '$me' OR target = '$me')");
	}
	else {
		$room = (int)$data['user_roomid'];
		$ghost = (isGhosted($data) || canViewGhost()) ? '' : 'AND pghost = 0';
		$q = $mysqli->query("SELECT post_id AS id FROM boom_chat WHERE post_id IN ($in) AND post_roomid = '$room' AND syslog = 0 $ghost");
	}
	$ok = array();
	if($q){ while($r = $q->fetch_assoc()){ $ok[] = (int)$r['id']; } }
	return $ok;
}
function brxPeer($mid){
	global $mysqli, $data;
	$me = (int)$data['user_id'];
	$mid = (int)$mid;
	$q = $mysqli->query("SELECT hunter, target FROM boom_private WHERE id = '$mid' LIMIT 1");
	if(!$q || !$q->num_rows){ return 0; }
	$r = $q->fetch_assoc();
	if((int)$r['hunter'] === $me){ return (int)$r['target']; }
	if((int)$r['target'] === $me){ return (int)$r['hunter']; }
	return 0;
}
/* summary per message: [[code, count, "uid,uid,..." (latest 40)], ...] in code order, plus my own code per message */
function brxSummary($type, $ids, $me){
	global $mysqli;
	$s = array(); $m = array();
	if(empty($ids)){ return array($s, $m); }
	$in = implode(',', array_map('intval', $ids));
	$t = ($type === 'private') ? 'private' : 'main';
	$me = (int)$me;
	$q = $mysqli->query("SELECT msg_id, emoji, COUNT(*) AS c, SUBSTRING_INDEX(GROUP_CONCAT(user_id ORDER BY id DESC), ',', 40) AS u, MAX(user_id = '$me') AS mine
		FROM boom_reactions WHERE msg_type = '$t' AND msg_id IN ($in) GROUP BY msg_id, emoji ORDER BY msg_id, emoji");
	if($q){
		while($r = $q->fetch_assoc()){
			$mid = (int)$r['msg_id'];
			$s[$mid][] = array((int)$r['emoji'], (int)$r['c'], (string)$r['u']);
			if((int)$r['mine'] === 1){ $m[$mid] = (int)$r['emoji']; }
		}
	}
	return array($s, $m);
}
function brxRedis(){
	static $r = null;
	if($r !== null){ return $r; }
	$r = false;
	if(class_exists('Redis')){
		try {
			$x = new Redis();
			if(@$x->connect(defined('REDIS_IP') ? REDIS_IP : '127.0.0.1', defined('REDIS_PORT') ? REDIS_PORT : 6379, 0.2)){
				if(defined('REDIS_PASS') && REDIS_PASS !== ''){ $x->auth(REDIS_PASS); }
				$r = $x;
			}
		}
		catch(Exception $e){ $r = false; }
	}
	return $r;
}
/* light per-user limit: 15 reactions per 10 seconds */
function brxLimited($uid){
	global $mysqli;
	$uid = (int)$uid;
	$r = brxRedis();
	if($r){
		try {
			$k = 'brx:rl:' . $uid;
			$n = $r->incr($k);
			if($n == 1){ $r->expire($k, 10); }
			return ($n > 15);
		}
		catch(Exception $e){}
	}
	$t = time() - 10;
	$q = $mysqli->query("SELECT COUNT(*) AS c FROM boom_reactions WHERE user_id = '$uid' AND time > '$t'");
	return ($q && (int)$q->fetch_assoc()['c'] >= 15);
}
/* cron-free cleanup, at most once an hour: old reactions, reactions on deleted messages, reactions of deleted users */
function brxGc($c){
	global $mysqli;
	$r = brxRedis();
	if($r){
		try { if(!$r->set('brx:gc', time(), array('nx', 'ex' => 3600))){ return; } }
		catch(Exception $e){ return; }
	}
	else if(mt_rand(1, 300) !== 1){ return; }
	$old = time() - ($c['days'] * 86400);
	$mysqli->query("DELETE FROM boom_reactions WHERE time < '$old' LIMIT 5000");
	$sets = array(
		"SELECT r.id FROM boom_reactions r LEFT JOIN boom_chat c ON c.post_id = r.msg_id WHERE r.msg_type = 'main' AND c.post_id IS NULL LIMIT 3000",
		"SELECT r.id FROM boom_reactions r LEFT JOIN boom_private p ON p.id = r.msg_id WHERE r.msg_type = 'private' AND p.id IS NULL LIMIT 3000",
		"SELECT r.id FROM boom_reactions r LEFT JOIN boom_users u ON u.user_id = r.user_id WHERE u.user_id IS NULL LIMIT 3000",
	);
	foreach($sets as $sql){
		$q = $mysqli->query($sql);
		if(!$q || !$q->num_rows){ continue; }
		$ids = array();
		while($x = $q->fetch_assoc()){ $ids[] = (int)$x['id']; }
		if($ids){ $mysqli->query("DELETE FROM boom_reactions WHERE id IN (" . implode(',', $ids) . ")"); }
	}
}
?>
