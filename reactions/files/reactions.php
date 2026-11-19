<?php if(boomAllow($addons['addons_access'])){
	require_once(BOOM_PATH . '/addons/reactions/system/addons_function.php');
	$brx_c = brxCfg($addons);
	if($brx_c['on'] === 1){
		$brx_v = @filemtime(BOOM_PATH . '/addons/reactions/files/reactions.js') . '-' . @filemtime(BOOM_PATH . '/addons/reactions/files/reactions.css');
?>
<script data-cfasync="false">
window.BRX_CFG = <?php echo json_encode(array('e' => $brx_c['emojis'], 'me' => (int)$data['user_id'], 'can' => (isGuest($data) && $brx_c['guest'] !== 1) ? 0 : 1, 'priv' => $brx_c['priv'], 'hint' => $brx_c['hint'], 'hintMax' => $brx_c['hintmax'], 'cr' => $brx_c['credit']), JSON_HEX_TAG | JSON_HEX_AMP); ?>;
boomAddCss('addons/reactions/files/reactions.css?v=<?php echo $brx_v; ?>');
</script>
<script data-cfasync="false" src="addons/reactions/files/reactions.js?v=<?php echo $brx_v; ?>"></script>
<?php } } ?>
