<?php
/* Reactions endpoint: act=get (t, ids) | act=react (t, mid, code) | act=who (t, mid, code) | act=admin (staff)
 * t = 'm' main room chat, 'p' private chat. No flood/mainBlocked calls here on purpose (they kick users). */
$load_addons = 'reactions';
require(__DIR__ . '/../../../system/config_addons.php');

header('Content-Type: application/json; charset=utf-8');
function brxOut($a){ echo json_encode($a); exit; }

$c   = brxCfg($addons);
$act = isset($_POST['act']) ? (string)$_POST['act'] : '';
$me  = (int)$data['user_id'];

if($act === 'admin'){
	if(!canManageAddons()){ brxOut(array('ok' => 0)); }
	$on    = ((int)($_POST['on'] ?? 1) === 1) ? 1 : 0;
	$guest = ((int)($_POST['guest'] ?? 1) === 1) ? 1 : 0;
	$priv  = ((int)($_POST['priv'] ?? 1) === 1) ? 1 : 0;
	$days  = max(1, min(365, (int)($_POST['days'] ?? 30)));
	$hint  = ((int)($_POST['hint'] ?? 1) === 1) ? 1 : 0;
	$hmax  = max(1, min(50, (int)($_POST['hintmax'] ?? 5)));
	$cred  = ((int)($_POST['credit'] ?? 1) === 1) ? 1 : 0;
	$list  = brxEncodeList($_POST['emojis'] ?? '');
	if($list === ''){ $list = brxDefaultEmojis(); }
	$esc = $mysqli->real_escape_string($list);
	$mysqli->query("UPDATE boom_addons SET custom1 = '$on', custom2 = '$esc', custom3 = '$guest', custom4 = '$priv', custom5 = '$days', custom6 = '$hint', custom7 = '$hmax', custom8 = '$cred' WHERE addons = 'reactions'");
	if(function_exists('redisUpdateAddons')){ redisUpdateAddons('reactions'); }
	brxOut(array('ok' => 1, 'emojis' => brxParseList($list)));
}

if($c['on'] !== 1 || $me <= 0){ brxOut(array('ok' => 0, 'off' => 1)); }
$type = (($_POST['t'] ?? '') === 'p') ? 'private' : 'main';
if($type === 'private' && $c['priv'] !== 1){ brxOut(array('ok' => 0, 'off' => 1)); }

if($act === 'get'){
	$ids = brxAllowed($type, brxIds($_POST['ids'] ?? '', 80));
	list($s, $m) = brxSummary($type, $ids, $me);
	brxOut(array('ok' => 1, 's' => empty($s) ? new stdClass() : $s, 'm' => empty($m) ? new stdClass() : $m));
}

$mid  = (int)($_POST['mid'] ?? 0);

/* everyone who reacted to one message, grouped by emoji (pill popover) */
if($act === 'whoall'){
	if($mid <= 0 || count(brxAllowed($type, array($mid))) !== 1){ brxOut(array('ok' => 0)); }
	$q = $mysqli->query("SELECT r.emoji, r.user_id, u.user_name FROM boom_reactions r JOIN boom_users u ON u.user_id = r.user_id
		WHERE r.msg_type = '$type' AND r.msg_id = '$mid' ORDER BY r.id DESC LIMIT 200");
	$g = array();
	if($q){
		while($r = $q->fetch_assoc()){
			$e = (int)$r['emoji'];
			if($e < 1 || $e > count($c['emojis'])){ continue; }
			if(!isset($g[$e])){ $g[$e] = array('c' => $e, 'u' => array()); }
			if(count($g[$e]['u']) < 40){ $g[$e]['u'][] = array((int)$r['user_id'], (string)$r['user_name']); }
		}
	}
	list($s, $m) = brxSummary($type, array($mid), $me);
	brxOut(array('ok' => 1, 'g' => array_values($g), 's' => $s[$mid] ?? array(), 'm' => $m[$mid] ?? 0));
}

$code = (int)($_POST['code'] ?? 0);
if($mid <= 0 || $code < 1 || $code > count($c['emojis'])){ brxOut(array('ok' => 0)); }
if(count(brxAllowed($type, array($mid))) !== 1){ brxOut(array('ok' => 0, 'err' => 'denied')); }

if($act === 'react'){
	if(isGuest($data) && $c['guest'] !== 1){ brxOut(array('ok' => 0, 'err' => 'guest')); }
	if($type === 'main' ? mainMuted() : privateMuted()){ brxOut(array('ok' => 0, 'err' => 'muted')); }
	$peer = ($type === 'private') ? brxPeer($mid) : 0;
	if(brxLimited($me)){ brxOut(array('ok' => 0, 'err' => 'slow')); }
	$t = time();
	$q = $mysqli->query("SELECT emoji FROM boom_reactions WHERE msg_type = '$type' AND msg_id = '$mid' AND user_id = '$me' LIMIT 1");
	$cur = ($q && $q->num_rows) ? (int)$q->fetch_assoc()['emoji'] : 0;
	if($cur === $code){
		$mysqli->query("DELETE FROM boom_reactions WHERE msg_type = '$type' AND msg_id = '$mid' AND user_id = '$me'");
	}
	else {
		$mysqli->query("INSERT INTO boom_reactions (msg_type, msg_id, user_id, emoji, time) VALUES ('$type', '$mid', '$me', '$code', '$t')
			ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), time = VALUES(time)");
	}
	brxGc($c);
	list($s, $m) = brxSummary($type, array($mid), $me);
	brxOut(array('ok' => 1, 'mid' => $mid, 's' => $s[$mid] ?? array(), 'm' => $m[$mid] ?? 0, 'peer' => $peer));
}

if($act === 'who'){
	$q = $mysqli->query("SELECT u.user_name FROM boom_reactions r JOIN boom_users u ON u.user_id = r.user_id
		WHERE r.msg_type = '$type' AND r.msg_id = '$mid' AND r.emoji = '$code' ORDER BY r.id DESC LIMIT 25");
	$names = array();
	if($q){ while($r = $q->fetch_assoc()){ $names[] = (string)$r['user_name']; } }
	$n = $mysqli->query("SELECT COUNT(*) AS c FROM boom_reactions WHERE msg_type = '$type' AND msg_id = '$mid' AND emoji = '$code'");
	brxOut(array('ok' => 1, 'n' => $names, 'c' => $n ? (int)$n->fetch_assoc()['c'] : count($names)));
}
brxOut(array('ok' => 0));
?>
