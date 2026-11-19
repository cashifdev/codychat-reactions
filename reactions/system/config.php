<?php
$load_addons = 'reactions';
require(__DIR__ . '/../../../system/config_addons.php');
if(!canManageAddons()){ die(); }

$c = brxCfg($addons);
$day = time() - 86400;
$st = array('all' => 0, 'day' => 0, 'main' => 0, 'priv' => 0);
$q = $mysqli->query("SELECT COUNT(*) a, SUM(time > '$day') b, SUM(msg_type = 'main') c, SUM(msg_type = 'private') d FROM boom_reactions");
if($q && $q->num_rows){ $r = $q->fetch_assoc(); $st = array('all' => (int)$r['a'], 'day' => (int)$r['b'], 'main' => (int)$r['c'], 'priv' => (int)$r['d']); }
function brxSel($id, $v){ return '<select id="' . $id . '" class="full_input"><option value="1" ' . ($v === 1 ? 'selected' : '') . '>On</option><option value="0" ' . ($v !== 1 ? 'selected' : '') . '>Off</option></select>'; }
echo elementTitle('Reactions', "loadLob('admin/setting_addons.php');");
?>
<div class="page_full"><div class="page_element"><div class="tpad15">
	<p class="sub_text">Emoji reactions on messages in the main chat and in private chats. Hover a message (or long-press on a phone) to react. One reaction per person per message.</p>
	<div class="bback pad15" style="border-radius:12px;margin:12px 0;display:flex;gap:22px;flex-wrap:wrap;">
		<div><b><?php echo $st['all']; ?></b><div class="sub_text text_xsmall">reactions stored</div></div>
		<div><b><?php echo $st['day']; ?></b><div class="sub_text text_xsmall">in the last 24 hours</div></div>
		<div><b><?php echo $st['main']; ?></b><div class="sub_text text_xsmall">main chat</div></div>
		<div><b><?php echo $st['priv']; ?></b><div class="sub_text text_xsmall">private chats</div></div>
	</div>
	<div class="setting_element"><p class="label">Reactions on this site</p><?php echo brxSel('brx_on', $c['on']); ?></div>
	<div class="setting_element"><p class="label">Emojis (up to 10, separated by spaces)</p>
		<p class="sub_text text_xsmall">Changing the order changes which emoji older reactions show, so add new ones at the end.</p>
		<input id="brx_emojis" class="full_input" value="<?php echo htmlspecialchars(implode(' ', $c['emojis']), ENT_QUOTES, 'UTF-8'); ?>"/></div>
	<div class="setting_element"><p class="label">Guests can react</p><?php echo brxSel('brx_guest', $c['guest']); ?></div>
	<div class="setting_element"><p class="label">Reactions in private chats</p><?php echo brxSel('brx_priv', $c['priv']); ?></div>
	<div class="setting_element"><p class="label">Show the "hold or hover a message to react" hint</p>
		<p class="sub_text text_xsmall">A small bubble over a recent message, so people find reactions. It stops for good once the person reacts or taps &times;; otherwise it comes back on later visits (at most once per visit).</p><?php echo brxSel('brx_hint', $c['hint']); ?></div>
	<div class="setting_element"><p class="label">Show the hint on at most this many visits</p>
		<input id="brx_hintmax" type="number" min="1" max="50" class="full_input" value="<?php echo $c['hintmax']; ?>"/></div>
	<div class="setting_element"><p class="label">Show credit link</p>
		<p class="sub_text text_xsmall">A small "Reactions by M Kashif" line with links to GitHub and chatnoregister.com at the bottom of the reactions list. Keeping it on supports free add-ons.</p><?php echo brxSel('brx_credit', $c['credit']); ?></div>
	<div class="setting_element"><p class="label">Keep reactions for (days)</p>
		<input id="brx_days" type="number" min="1" max="365" class="full_input" value="<?php echo $c['days']; ?>"/></div>
	<button class="reg_button theme_btn tmargin10" onclick="brxAdminSave()">Save</button>
	<p class="sub_text text_xsmall tmargin10">Reactions add-on by <a href="https://github.com/cashifdev" target="_blank">M Kashif</a> · see it live at <a href="https://chatnoregister.com" target="_blank">chatnoregister.com</a></p>
</div></div></div>
<script>
function brxAdminSave(){
	$.post('addons/reactions/system/action.php', { act: 'admin', on: $('#brx_on').val(), emojis: $('#brx_emojis').val(), guest: $('#brx_guest').val(), priv: $('#brx_priv').val(), days: $('#brx_days').val(), hint: $('#brx_hint').val(), credit: $('#brx_credit').val(), hintmax: $('#brx_hintmax').val() }, function(r){
		if(r && r.ok){ if(r.emojis){ $('#brx_emojis').val(r.emojis.join(' ')); } callSaved('Saved', 1); } else { callSaved('Not saved', 3); }
	}, 'json');
}
</script>
