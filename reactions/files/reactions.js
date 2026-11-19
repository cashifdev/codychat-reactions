/* Reactions for Codychat 10.1 by M Kashif (https://github.com/cashifdev), MIT license.
 * Emoji reactions on main chat and private chat messages.
 * Reactions load when a batch of messages appears (room load, history, private open) and refresh every 12 seconds
 * for the newest messages while the tab is visible. Optional: a chat with its own socket bridge can expose
 * window.rxSocketSend(msg) / window.rxSocketConnected() and trigger jQuery event 'rx:update' for instant sync.
 */
(function(){
	'use strict';
	if(window.BRX) return;
	var C = window.BRX_CFG || {};
	var E = C.e || [];
	var ME = parseInt(C.me, 10) || 0;
	var URL = 'addons/reactions/system/action.php';
	var S = { main: {}, p: {} }, MINE = { main: {}, p: {} }, Q = { main: {}, p: {} }, qT = 0, busy = {};
	var HOVER = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
	var MAIN_ID = 'chat_logs_container';
	var MAIN_SEL = '#chat_logs_container > li.ch_logs';
	var PRIV_SEL = 'li.privlog';

	function num(v){ return parseInt(v, 10) || 0; }
	function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function wsOk(){ try { return typeof window.rxSocketConnected === 'function' && !!window.rxSocketConnected(); } catch(e){ return false; } }
	function tp(k){ return k === 'p' ? 'p' : 'm'; }

	function liOf(el){
		if(!el || !el.closest) return null;
		var li = el.closest('li.privlog');
		if(li) return C.priv ? li : null;
		li = el.closest('li.ch_logs');
		return (li && li.parentNode && li.parentNode.id === MAIN_ID) ? li : null;
	}
	function info(li){
		if(!li) return null;
		if(li.classList.contains('privlog')) return { k: 'p', mid: num(li.getAttribute('data-id')) };
		return { k: 'main', mid: num(li.getAttribute('data') || String(li.id).replace('log', '')) };
	}
	function nodesFor(k, mid){
		if(k === 'p') return document.querySelectorAll(PRIV_SEL + '[data-id="' + mid + '"]');
		var x = document.getElementById('log' + mid);
		return (x && x.classList.contains('ch_logs')) ? [x] : [];
	}
	function bubble(li, k){ return k === 'p' ? (li.querySelector('.prbox') || li) : (li.querySelector('.mbubble') || li.querySelector('.log_content') || li); }
	/* the coloured bubble the pill sits on */
	function pillHost(li, k){ return k === 'p' ? (li.querySelector('.prbox > .hunter_private, .prbox > .target_private') || li.querySelector('.prbox')) : (li.querySelector('.mbubble') || li.querySelector('.chat_tmessage') || li.querySelector('.log_content')); }

	/* ── chat background → pill border colour (light or dark theme) ── */
	var bgMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
	function rgb(c){ var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || ''); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; }
	function theme(li){
		var list = li.parentNode, now = Date.now(), t = (bgMemo && list) ? bgMemo.get(list) : null;
		if(t && now - t.at < 15000) return t;
		var el = li, c = null;
		while(el && el.nodeType === 1){ var v = rgb(getComputedStyle(el).backgroundColor); if(v && v[3] > 0.5){ c = v; break; } el = el.parentElement; }
		c = c || [255, 255, 255, 1];
		t = { at: now, bd: 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')', dark: (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 140 };
		if(bgMemo && list) bgMemo.set(list, t);
		return t;
	}

	/* ── compact pill on the bubble's bottom corner: up to 3 emojis (most used first) + total ── */
	function sorted(k, mid){
		return (S[k][mid] || []).filter(function(x){ return E[x[0] - 1] && x[1] > 0; }).sort(function(a, b){ return (b[1] - a[1]) || (a[0] - b[0]); });
	}
	function paint(k, mid){
		var s = sorted(k, mid), mine = MINE[k][mid] | 0, html = '', total = 0, i;
		for(i = 0; i < s.length; i++) total += s[i][1];
		for(i = 0; i < s.length && i < 3; i++) html += '<span class="brx-e">' + esc(E[s[i][0] - 1]) + '</span>';
		if(html && total > 1) html += '<span class="brx-n">' + total + '</span>';
		var label = s.map(function(x){ return E[x[0] - 1] + ' ' + x[1]; }).join(', ');
		var lis = nodesFor(k, mid);
		for(var j = 0; j < lis.length; j++){
			var li = lis[j], b = pillHost(li, k);
			if(!b) continue;
			var pill = null;
			for(var x = 0; x < b.children.length; x++){ if(b.children[x].classList.contains('brx-pill')){ pill = b.children[x]; break; } }
			if(!html){
				if(pill) pill.parentNode.removeChild(pill);
				b.classList.remove('brx-host'); li.classList.remove('brx-has');
				continue;
			}
			if(!pill){
				pill = document.createElement('button');
				pill.type = 'button';
				pill.className = 'brx-pill';
				b.appendChild(pill);
			}
			if(pill.getAttribute('data-h') !== html){ pill.setAttribute('data-h', html); pill.innerHTML = html; }
			pill.setAttribute('aria-label', 'Reactions: ' + label + '. Show who reacted');
			pill.classList.toggle('brx-mine', !!mine);
			var th = theme(li);
			pill.style.setProperty('--brx-bd', th.bd);
			pill.classList.toggle('brx-dark', th.dark);
			b.classList.add('brx-host'); li.classList.add('brx-has');
			side(li, b, pill);
		}
		if(sh && sh.k === k && sh.mid === mid) sheetRows();
	}
	/* bottom-right (bottom-left on my own private messages); flips toward free space when the bubble is narrower than the pill */
	function side(li, b, pill){
		var out = li.classList.contains('outpriv'), left = out;
		if(b.offsetWidth && b.offsetWidth < pill.offsetWidth + 14) left = !out;
		pill.classList.toggle('brx-l', left);
	}
	function hasMe(item){ return (',' + (item[2] || '') + ',').indexOf(',' + ME + ',') >= 0; }
	function apply(k, mid, s, mine){
		s = Array.isArray(s) ? s : [];
		S[k][mid] = s;
		if(mine !== undefined){ MINE[k][mid] = mine | 0; }
		else {
			var prev = MINE[k][mid] | 0, found = 0, prevItem = null;
			for(var i = 0; i < s.length; i++){ if(hasMe(s[i])) found = s[i][0]; if(s[i][0] === prev) prevItem = s[i]; }
			if(found) MINE[k][mid] = found;
			else if(!prevItem) MINE[k][mid] = 0;
			else if(String(prevItem[2] || '').split(',').filter(Boolean).length >= prevItem[1]) MINE[k][mid] = 0;
		}
		paint(k, mid);
	}

	/* ── batch fetch ── */
	function want(k, mid){
		if(!mid || (k === 'p' && !C.priv)) return;
		Q[k][mid] = 1;
		clearTimeout(qT);
		qT = setTimeout(flush, 350);
	}
	function flush(){
		['main', 'p'].forEach(function(k){
			var ids = Object.keys(Q[k]);
			Q[k] = {};
			while(ids.length){ get(k, ids.splice(0, 80)); }
		});
	}
	function get(k, ids){
		$.post(URL, { act: 'get', t: tp(k), ids: ids.join(',') }, function(r){
			if(!r || !r.ok) return;
			for(var i = 0; i < ids.length; i++){
				var id = num(ids[i]);
				if(!r.s[id] && !S[k][id]) continue;
				apply(k, id, r.s[id] || [], num(r.m[id]));
			}
		}, 'json');
	}
	function visible(){
		var a = document.querySelectorAll(MAIN_SEL), i;
		for(i = Math.max(0, a.length - 25); i < a.length; i++){ want('main', info(a[i]).mid); }
		if(!C.priv) return;
		var lists = document.querySelectorAll('#show_private');
		for(var j = 0; j < lists.length; j++){
			if(!lists[j].offsetWidth) continue;
			var b = lists[j].querySelectorAll(PRIV_SEL);
			for(i = Math.max(0, b.length - 15); i < b.length; i++){ want('p', info(b[i]).mid); }
		}
	}

	/* ── watch message lists ── */
	function watch(list){
		if(!list || list._brx || !window.MutationObserver) return;
		list._brx = 1;
		var max = 0;
		var cur = list.querySelectorAll(list.id === MAIN_ID ? 'li.ch_logs' : PRIV_SEL);
		for(var i = 0; i < cur.length; i++){ var f = info(cur[i]); if(f && f.mid){ want(f.k, f.mid); if(f.mid > max) max = f.mid; } }
		new MutationObserver(function(muts){
			var added = [], removed = 0;
			for(var m = 0; m < muts.length; m++){
				var an = muts[m].addedNodes, rn = muts[m].removedNodes;
				for(var a = 0; a < an.length; a++){ if(an[a].nodeType === 1 && an[a].tagName === 'LI') added.push(an[a]); }
				for(var r = 0; r < rn.length; r++){ if(rn[r].nodeType === 1 && rn[r].tagName === 'LI') removed++; }
			}
			if(!list.querySelector('li')) max = 0;
			if(!added.length) return;
			var bulk = added.length >= 3 || removed > 0 || max === 0;
			if(list.id !== MAIN_ID && (bulk || added.length)) armHint(list, 2000);
			for(var x = 0; x < added.length; x++){
				var li = added[x];
				if(!li.matches || !(li.matches('li.ch_logs') || li.matches(PRIV_SEL))) continue;
				var it = info(li);
				if(!it || !it.mid) continue;
				if(S[it.k][it.mid]) paint(it.k, it.mid);
				if(bulk || it.mid <= max) want(it.k, it.mid);
				if(it.mid > max) max = it.mid;
			}
		}).observe(list, { childList: true });
	}
	function watchAll(){
		watch(document.getElementById(MAIN_ID));
		if(!C.priv) return;
		watch(document.getElementById('show_private'));
	}

	/* ── reacting ── */
	function react(k, mid, code){
		if(!C.can){ toast('Sign up to react to messages'); return; }
		hintMark(); dismissHint(); /* any reaction: hint is done for good */
		var bk = k + mid;
		if(busy[bk]) return;
		busy[bk] = 1;
		var old = (S[k][mid] || []).map(function(x){ return x.slice(); }), prev = MINE[k][mid] | 0;
		var s = old.map(function(x){ return x.slice(); }), i;
		if(prev){ for(i = 0; i < s.length; i++){ if(s[i][0] === prev){ s[i][1]--; } } }
		if(prev !== code){
			var hit = false;
			for(i = 0; i < s.length; i++){ if(s[i][0] === code){ s[i][1]++; hit = true; } }
			if(!hit){ s.push([code, 1, String(ME)]); s.sort(function(a, b){ return a[0] - b[0]; }); }
		}
		s = s.filter(function(x){ return x[1] > 0; });
		apply(k, mid, s, prev === code ? 0 : code);
		pop(k, mid, prev === code ? 0 : code);
		$.post(URL, { act: 'react', t: tp(k), mid: mid, code: code }, function(r){
			if(r && r.ok){
				apply(k, mid, r.s, num(r.m));
				if(sh && sh.k === k && sh.mid === mid) loadWho();
				if(typeof window.rxSocketSend === 'function'){ window.rxSocketSend({ type: 'rx_react', t: tp(k), mid: mid, targetId: num(r.peer) }); }
			}
			else {
				apply(k, mid, old, prev);
				if(r && r.err === 'slow') toast('Easy there, try again in a moment');
				else if(r && r.err === 'muted') toast('You can\'t react right now');
				else if(r && r.err === 'guest') toast('Sign up to react to messages');
			}
		}, 'json').fail(function(){ apply(k, mid, old, prev); }).always(function(){ delete busy[bk]; });
	}
	function pop(k, mid, code){
		if(!code) return;
		var lis = nodesFor(k, mid);
		for(var i = 0; i < lis.length; i++){
			var ch = lis[i].querySelector('.brx-pill');
			if(ch){ ch.classList.remove('brx-pop'); void ch.offsetWidth; ch.classList.add('brx-pop'); }
		}
	}
	function toast(t, type){
		if(typeof callSaved === 'function'){ try { callSaved(t, type || 3); return; } catch(e){} }
	}

	/* ── picker ── */
	var COPY_SVG = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"/></svg>';
	var pk = null, pkFor = null, pkLi = null, hideT = 0, showT = 0, suppress = 0;
	function buildPicker(){
		pk = document.createElement('div');
		pk.className = 'brx-picker';
		pk.setAttribute('role', 'toolbar');
		var h = '';
		for(var i = 0; i < E.length; i++){ h += '<button type="button" class="brx-pick" data-c="' + (i + 1) + '" aria-label="React ' + esc(E[i]) + '">' + esc(E[i]) + '</button>'; }
		h += '<button type="button" class="brx-pick brx-copy" aria-label="Copy text" title="Copy text">' + COPY_SVG + '</button>';
		pk.innerHTML = h;
		document.body.appendChild(pk);
		pk.addEventListener('mouseenter', function(){ clearTimeout(hideT); });
		/* hover close is for a real mouse only: compat mouse events after a touch must not close a long-press picker */
		pk.addEventListener('mouseleave', function(){ if(HOVER && !pk.classList.contains('brx-touchpk')) schedHide(250); });
		pk.addEventListener('click', function(ev){
			var b = ev.target.closest ? ev.target.closest('.brx-pick') : null;
			if(!b || !pkFor) return;
			ev.preventDefault(); ev.stopPropagation();
			var f = pkFor, li = pkLi;
			hidePicker();
			if(b.classList.contains('brx-copy')){ copyText(li, f.k); return; }
			react(f.k, f.mid, num(b.getAttribute('data-c')));
		});
	}
	/* touch = opened by a long press: shows the Copy button, since text selection is off on touch */
	function showPicker(li, touch){
		if(!E.length) return;
		var it = info(li);
		if(!it || !it.mid) return;
		if(!C.can && !touch) return;
		if(!pk) buildPicker();
		clearTimeout(hideT);
		pkFor = it; pkLi = li;
		pk.classList.toggle('brx-touchpk', !!touch);
		pk.classList.toggle('brx-copyonly', !C.can);
		var mine = MINE[it.k][it.mid] | 0, bs = pk.children;
		for(var i = 0; i < bs.length; i++){ bs[i].classList.toggle('brx-sel', !!mine && num(bs[i].getAttribute('data-c')) === mine); }
		pk.style.visibility = 'hidden';
		pk.classList.add('brx-show');
		if(!placePicker()) hidePicker();
	}
	/* (re)position over the message; false when the message is gone or scrolled out of view */
	function placePicker(){
		var li = pkLi, it = pkFor;
		if(!pk || !li || !it || !document.body.contains(li)) return false;
		var r = bubble(li, it.k).getBoundingClientRect(), pw = pk.offsetWidth, ph = pk.offsetHeight;
		var vh = window.innerHeight || document.documentElement.clientHeight;
		if(!r.width || r.bottom < 0 || r.top > vh) return false;
		var vw = window.innerWidth || document.documentElement.clientWidth;
		var top = r.top - ph - 6;
		if(top < 4) top = r.bottom + 6;
		var left = li.classList.contains('outpriv') ? (r.right - pw) : r.left;
		left = Math.max(6, Math.min(left, vw - pw - 6));
		pk.style.top = Math.round(top) + 'px';
		pk.style.left = Math.round(left) + 'px';
		pk.style.visibility = '';
		return true;
	}
	function hidePicker(){
		clearTimeout(showT); clearTimeout(hideT);
		if(pk) pk.classList.remove('brx-show');
		pkFor = null; pkLi = null;
	}
	function schedHide(ms){ clearTimeout(hideT); hideT = setTimeout(hidePicker, ms); }
	function clearSel(){ try { var s = window.getSelection && window.getSelection(); if(s && s.removeAllRanges) s.removeAllRanges(); } catch(e){} }

	/* ── copy the message text (picker Copy button) ── */
	function msgText(li, k){
		var b = pillHost(li, k);
		if(!b) return '';
		var c = b.cloneNode(true), rm = c.querySelectorAll('.brx-pill, script, style, button'), i;
		for(i = 0; i < rm.length; i++) rm[i].parentNode.removeChild(rm[i]);
		var im = c.querySelectorAll('img[alt]');
		for(i = 0; i < im.length; i++) im[i].parentNode.replaceChild(document.createTextNode(im[i].getAttribute('alt')), im[i]);
		var br = c.querySelectorAll('br');
		for(i = 0; i < br.length; i++) br[i].parentNode.replaceChild(document.createTextNode('\n'), br[i]);
		return (c.textContent || '').replace(/[ \t]+\n/g, '\n').trim();
	}
	function copyText(li, k){
		var t = li ? msgText(li, k) : '';
		if(!t){ toast('Nothing to copy'); return; }
		var done = function(){ toast('Copied', 1); };
		var old = function(){
			var ta = document.createElement('textarea');
			ta.value = t; ta.setAttribute('readonly', '');
			ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
			document.body.appendChild(ta);
			ta.select(); try { ta.setSelectionRange(0, t.length); } catch(e){}
			var ok = false; try { ok = document.execCommand('copy'); } catch(e){}
			document.body.removeChild(ta); clearSel();
			if(ok) done(); else toast('Could not copy');
		};
		if(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false){ navigator.clipboard.writeText(t).then(done, old); }
		else old();
	}

	/* ── who reacted: popover (desktop) / bottom sheet (touch, narrow) ── */
	var sh = null, shEl = null, shBack = null, shT = 0, whoReq = 0;
	function sheetMode(){ return !HOVER || (window.innerWidth || 1000) <= 600; }
	function openSheet(li, pill){
		var it = info(li);
		if(!it || !it.mid) return;
		hidePicker();
		closeSheet(true);
		sh = { k: it.k, mid: it.mid, li: li, pill: pill, who: null, mob: sheetMode() };
		shEl = document.createElement('div');
		shEl.className = 'brx-sheet' + (sh.mob ? ' brx-sheet-mob' : ' brx-sheet-pop');
		shEl.setAttribute('role', 'dialog');
		shEl.setAttribute('aria-label', 'Reactions');
		shEl.innerHTML = (sh.mob ? '<div class="brx-grab"></div>' : '') + '<div class="brx-sh-h">Reactions</div><div class="brx-sh-rows"></div>' +
			(C.can ? '<div class="brx-sh-f">Tap an emoji to add or remove yours</div>' : '') +
			(C.cr ? '<div class="brx-sh-cr">Reactions by <a href="https://github.com/cashifdev" target="_blank" rel="noopener">M Kashif</a> · <a href="https://chatnoregister.com" target="_blank" rel="noopener">chatnoregister.com</a></div>' : '');
		if(sh.mob){
			shBack = document.createElement('div');
			shBack.className = 'brx-back';
			shBack.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); closeSheet(); });
			document.body.appendChild(shBack);
		}
		document.body.appendChild(shEl);
		shEl.addEventListener('click', function(ev){
			ev.stopPropagation();
			var row = ev.target.closest ? ev.target.closest('.brx-row') : null;
			if(!row || !sh) return;
			ev.preventDefault();
			if(!C.can){ toast('Sign up to react to messages'); return; }
			react(sh.k, sh.mid, num(row.getAttribute('data-c')));
		});
		sheetRows();
		placeSheet();
		requestAnimationFrame(function(){ if(shEl) shEl.classList.add('brx-in'); if(shBack) shBack.classList.add('brx-in'); });
		loadWho();
	}
	function loadWho(){
		if(!sh) return;
		var my = ++whoReq, k = sh.k, mid = sh.mid;
		$.post(URL, { act: 'whoall', t: tp(k), mid: mid }, function(r){
			if(!r || !r.ok || !sh || my !== whoReq || sh.k !== k || sh.mid !== mid) return;
			var w = {};
			for(var i = 0; i < (r.g || []).length; i++){ w[num(r.g[i].c)] = r.g[i].u || []; }
			sh.who = w;
			sheetRows();
		}, 'json');
	}
	function sheetRows(){
		if(!sh || !shEl) return;
		var s = sorted(sh.k, sh.mid), mine = MINE[sh.k][sh.mid] | 0, box = shEl.querySelector('.brx-sh-rows');
		if(!s.length){ closeSheet(); return; }
		var html = '';
		for(var i = 0; i < s.length; i++){
			var code = s[i][0], c = s[i][1], names = '…';
			if(sh.who){
				var u = sh.who[code] || [], list = [];
				for(var j = 0; j < u.length; j++){ if(num(u[j][0]) !== ME) list.push(u[j][1]); }
				if(mine === code) list.unshift('You');
				var more = c - list.length;
				names = list.length ? list.join(', ') + (more > 0 ? ' and ' + more + ' more' : '') : (c + ' ' + (c === 1 ? 'person' : 'people'));
			}
			html += '<button type="button" class="brx-row' + (mine === code ? ' brx-mine' : '') + '" data-c="' + code + '"' + (C.can ? '' : ' aria-disabled="true"') + '>' +
				'<span class="brx-e">' + esc(E[code - 1]) + '</span><span class="brx-who">' + esc(names) + '</span><span class="brx-n">' + c + '</span></button>';
		}
		if(box.getAttribute('data-h') !== html){ box.setAttribute('data-h', html); box.innerHTML = html; }
		if(!sh.mob) placeSheet();
	}
	function placeSheet(){
		if(!sh || !shEl || sh.mob) return;
		var p = (sh.pill && document.body.contains(sh.pill)) ? sh.pill : pillHost(sh.li, sh.k);
		if(!p || !document.body.contains(p)){ closeSheet(); return; }
		var r = p.getBoundingClientRect(), w = shEl.offsetWidth, h = shEl.offsetHeight;
		var vw = window.innerWidth || document.documentElement.clientWidth, vh = window.innerHeight || document.documentElement.clientHeight;
		if(!r.width || r.bottom < 0 || r.top > vh){ closeSheet(); return; } /* follows its pill while a busy chat scrolls, closes once it is off screen */
		var top = r.bottom + 6;
		if(top + h > vh - 6) top = Math.max(6, r.top - h - 6);
		var left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, vw - w - 6));
		shEl.style.top = Math.round(top) + 'px';
		shEl.style.left = Math.round(left) + 'px';
	}
	function closeSheet(now){
		whoReq++;
		var a = shEl, b = shBack;
		sh = null; shEl = null; shBack = null;
		[a, b].forEach(function(x){
			if(!x) return;
			if(now){ if(x.parentNode) x.parentNode.removeChild(x); return; }
			x.classList.remove('brx-in'); x.classList.add('brx-out');
			setTimeout(function(){ if(x.parentNode) x.parentNode.removeChild(x); }, 200);
		});
	}

	/* ── events ── */
	function inBubble(t){ return t && t.closest && t.closest('.mbubble, .chat_tmessage, .log_content, .prbox'); }
	function onPill(t){ return t && t.closest ? t.closest('.brx-pill') : null; }
	function bind(){
		var root = document.documentElement;
		if(HOVER){
			document.addEventListener('mouseover', function(ev){
				var t = ev.target;
				if(onPill(t) || (shEl && shEl.contains(t))) return;
				if(!inBubble(t)) return;
				var li = liOf(t);
				if(!li) return;
				if(pkLi === li && pk && pk.classList.contains('brx-show')){ clearTimeout(hideT); return; }
				clearTimeout(showT);
				showT = setTimeout(function(){ showPicker(li); }, 420);
			}, true);
			document.addEventListener('mouseout', function(ev){
				var li = liOf(ev.target);
				if(!li) return;
				var to = ev.relatedTarget;
				if(to && (li.contains(to) || (pk && pk.contains(to)))) return;
				clearTimeout(showT);
				if(pkLi === li) schedHide(300);
			}, true);
		}
		/* touch: a long press on a bubble opens the picker. While a finger is on a bubble, text selection and the
		 * native callout/context menu are off (class brx-touch on <html>, plus selectstart/contextmenu guards);
		 * a real mouse turns the class off again, so desktop text selection keeps working. */
		var lp = 0, lpLi = null, fired = false, held = false, sx = 0, sy = 0;
		function fire(){
			clearTimeout(lp); lp = 0;
			if(!lpLi) return;
			fired = true;
			suppress = Date.now() + 1500;
			clearSel();
			showPicker(lpLi, true);
			clearSel();
			if(navigator.vibrate){ try { navigator.vibrate(12); } catch(e){} }
		}
		document.addEventListener('touchstart', function(ev){
			var t = ev.target;
			if(pk && pk.contains(t)) return;
			if(shEl && shEl.contains(t)) return;
			if(pk && pk.classList.contains('brx-show')) hidePicker();
			fired = false; held = false; lpLi = null;
			if(ev.touches.length !== 1) { clearTimeout(lp); lp = 0; return; }
			if(onPill(t)) return; /* tap on the pill = who reacted (click) */
			var li = liOf(t);
			if(!li || !inBubble(t)) return;
			root.classList.add('brx-touch');
			held = true; lpLi = li;
			sx = ev.touches[0].clientX; sy = ev.touches[0].clientY;
			clearTimeout(lp);
			lp = setTimeout(fire, 450);
		}, { passive: true });
		document.addEventListener('touchmove', function(ev){
			if(!lp) return;
			var p = ev.touches[0];
			if(Math.abs(p.clientX - sx) > 10 || Math.abs(p.clientY - sy) > 10){ clearTimeout(lp); lp = 0; lpLi = null; }
		}, { passive: true });
		function end(){
			clearTimeout(lp); lp = 0; held = false;
			if(fired){ suppress = Date.now() + 450; clearSel(); }
			lpLi = null;
		}
		document.addEventListener('touchend', end, { passive: true });
		document.addEventListener('touchcancel', end, { passive: true });
		/* Android fires contextmenu on a long press: never show the native menu on a bubble, open the picker instead */
		document.addEventListener('contextmenu', function(ev){
			if(lp && lpLi){ ev.preventDefault(); fire(); return; }
			if(Date.now() < suppress || (held && root.classList.contains('brx-touch'))) ev.preventDefault();
		}, true);
		document.addEventListener('selectstart', function(ev){
			if(held || Date.now() < suppress){ if(inBubble(ev.target) || (ev.target && ev.target.nodeType === 3 && inBubble(ev.target.parentNode))) ev.preventDefault(); }
		}, true);
		document.addEventListener('pointerdown', function(ev){ if(ev.pointerType === 'mouse') root.classList.remove('brx-touch'); }, true);
		/* a long press must not also open the message's own menu on release */
		document.addEventListener('click', function(ev){
			if(Date.now() < suppress && !(pk && pk.contains(ev.target)) && !(shEl && shEl.contains(ev.target))){ ev.preventDefault(); ev.stopPropagation(); }
		}, true);
		document.addEventListener('mousedown', function(ev){
			var t = ev.target;
			if(pk && pk.classList.contains('brx-show') && !pk.contains(t) && !liOf(t)) hidePicker();
			if(shEl && !sh.mob && !shEl.contains(t) && !onPill(t)) closeSheet();
		}, true);
		/* tap the pill: who reacted, with tap-to-toggle */
		$(document).on('click', '.brx-pill', function(ev){
			ev.preventDefault(); ev.stopPropagation();
			var li = liOf(this);
			if(!li) return;
			if(sh && sh.pill === this){ closeSheet(); return; }
			openSheet(li, this);
		});
		/* new messages auto-scroll a busy chat: the open picker follows its message, and closes once it leaves the screen */
		var pkRaf = 0, shRaf = 0;
		document.addEventListener('scroll', function(ev){
			if(pk && pk.classList.contains('brx-show') && !pkRaf){
				pkRaf = requestAnimationFrame(function(){ pkRaf = 0; if(pk && pk.classList.contains('brx-show') && !placePicker()) hidePicker(); });
			}
			if(sh && !sh.mob && !(shEl && shEl.contains(ev.target))){ cancelAnimationFrame(shRaf); shRaf = requestAnimationFrame(placeSheet); }
		}, true);
		window.addEventListener('resize', function(){ if(sh && !sh.mob) placeSheet(); });
		document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape'){ hidePicker(); closeSheet(); } });
		/* live updates pushed by the socket server */
		$(document).on('rx:update', function(e, m){
			if(!m || !m.mid) return;
			var k = m.t === 'p' ? 'p' : 'main';
			if(k === 'p' && !C.priv) return;
			apply(k, num(m.mid), m.s || []);
			if(sh && sh.k === k && sh.mid === num(m.mid)){ clearTimeout(shT); shT = setTimeout(loadWho, 250); }
		});
	}

	/* ── discovery hint: "Hover/Hold a message to react" (custom6 on/off, custom7 max visits) ──
	 * Done for good only when the user reacts (anywhere) or taps ×. Otherwise it comes back on later visits:
	 * at most once per page load, and on at most C.hintMax browser sessions (counted once per sessionStorage session). */
	var HK = 'rx_hint_v2', HN = HK + '_n', HS = HK + '_s', HMAX = Math.max(1, num(C.hintMax) || 5);
	var hint = null, hintLi = null, hintList = null, hintT = 0, hintAuto = 0, hintIv = 0, hintDone = 0, hintPage = 0, hintMainArmed = 0;
	function hintSeen(){
		if(hintDone || hintPage) return true;
		try {
			var ls = window.localStorage;
			if(ls.getItem(HK) === 'done') return true;
			var n = num(ls.getItem(HN));
			/* this session already counted as a visit: allowed even if it was the last one */
			if(n >= HMAX && window.sessionStorage.getItem(HS) !== '1') return true;
			return false;
		} catch(e){ return true; }
	}
	function hintOk(){ return !!(C.hint && C.can && E.length) && !hintSeen(); }
	function hintMark(){ hintDone = 1; try { window.localStorage.setItem(HK, 'done'); } catch(e){} }
	function hintCount(){
		hintPage = 1;
		try {
			if(window.sessionStorage.getItem(HS) === '1') return;
			window.sessionStorage.setItem(HS, '1');
			window.localStorage.setItem(HN, String(num(window.localStorage.getItem(HN)) + 1));
		} catch(e){}
	}
	function armHint(list, ms){
		if(!list || hint || !hintOk()) return;
		if(hintList && hintList !== list && list.id === MAIN_ID) return; /* a private chat that just opened wins */
		hintList = list;
		clearTimeout(hintT);
		hintT = setTimeout(function(){ tryHint(0); }, ms);
	}
	function hintBounds(list){
		var vw = window.innerWidth || document.documentElement.clientWidth, vh = window.innerHeight || document.documentElement.clientHeight;
		var r = list.getBoundingClientRect();
		return { top: Math.max(0, r.top), bottom: Math.min(vh, r.bottom), left: Math.max(0, r.left), right: Math.min(vw, r.right) };
	}
	/* the message's bubble is on screen inside its list and not covered by a panel */
	function hintVisible(li, list){
		if(!li || !list || !document.body.contains(li) || !list.offsetWidth) return null;
		var it = info(li), bb = it ? bubble(li, it.k) : null;
		if(!bb || !bb.offsetWidth) return null;
		var r = bb.getBoundingClientRect(), b = hintBounds(list);
		if(r.top < b.top + 2 || r.top > b.bottom - 24 || r.right < b.left || r.left > b.right) return null;
		var cx = Math.max(r.left + 2, Math.min(r.left + 24, r.right - 2)), cy = r.top + Math.min(10, r.height / 2);
		var el = document.elementFromPoint(cx, cy);
		if(!el || (!li.contains(el) && !(hint && hint.contains(el)))) return null;
		return r;
	}
	function hintTarget(list){
		if(!list || !list.offsetWidth) return null;
		var a = list.querySelectorAll(list.id === MAIN_ID ? 'li.ch_logs' : PRIV_SEL), fb = null;
		for(var i = a.length - 1; i >= Math.max(0, a.length - 15); i--){
			var it = info(a[i]);
			if(!it || !it.mid || !hintVisible(a[i], list)) continue;
			if(a[i].classList.contains('outpriv') || a[i].getAttribute('data-uid') == ME){ fb = fb || a[i]; continue; } /* prefer someone else's message */
			return a[i];
		}
		return fb;
	}
	function tryHint(n){
		if(hint || !hintOk()) return;
		if(document.hidden){ document.addEventListener('visibilitychange', function f(){ document.removeEventListener('visibilitychange', f); hintT = setTimeout(function(){ tryHint(n); }, 1500); }); return; }
		var busyUi = pk && pk.classList.contains('brx-show');
		var main = document.getElementById(MAIN_ID), li = null, list = hintList;
		if(!busyUi){
			li = hintTarget(list);
			if(!li && list !== main){ list = main; li = hintTarget(main); }
		}
		if(!li){ if(n < 20) hintT = setTimeout(function(){ tryHint(n + 1); }, 3000); return; }
		showHint(li, list);
	}
	function showHint(li, list){
		hintLi = li; hintList = list;
		hint = document.createElement('div');
		hint.className = 'brx-hint';
		hint.setAttribute('role', 'status');
		hint.innerHTML = '<span class="brx-hint-t"></span><button type="button" class="brx-hint-x" aria-label="Close">&times;</button>';
		var t = hint.firstChild;
		t.appendChild(document.createTextNode((HOVER ? 'Hover' : 'Hold') + ' a message to react '));
		var em = document.createElement('span'); em.className = 'brx-hint-e'; em.textContent = E.slice(0, 3).join(''); t.appendChild(em);
		hint.style.visibility = 'hidden';
		document.body.appendChild(hint);
		hint.addEventListener('click', function(ev){
			ev.preventDefault(); ev.stopPropagation();
			if(ev.target.closest && ev.target.closest('.brx-hint-x')){ hintMark(); dismissHint(); return; } /* × = done for good */
			var li = hintLi; /* body tap: mini demo, open the picker on the anchored message */
			dismissHint();
			if(li && document.body.contains(li)) showPicker(li);
		});
		placeHint();
		hintIv = setInterval(placeHint, 300);
		window.addEventListener('resize', placeHint);
		document.addEventListener('scroll', placeHint, true);
		hintAuto = setTimeout(dismissHint, 10000); /* auto-hide does not count as done */
		hintCount();
	}
	function placeHint(){
		if(!hint || hint.classList.contains('brx-hint-out')) return;
		if(!document.body.contains(hintLi)){ dismissHint(); return; }
		var r = hintVisible(hintLi, hintList);
		if(!r){ hint.style.visibility = 'hidden'; return; }
		var b = hintBounds(hintList), w = hint.offsetWidth, h = hint.offsetHeight;
		var vw = window.innerWidth || document.documentElement.clientWidth;
		var top = r.top - h - 9, below = false;
		if(top < Math.max(4, b.top - 8)){ top = r.top + Math.min(r.height, 34) + 9; below = true; }
		var left = hintLi.classList.contains('outpriv') ? (r.right - w) : (r.left - 4);
		left = Math.max(8, Math.min(left, vw - w - 8));
		var ax = Math.max(16, Math.min((hintLi.classList.contains('outpriv') ? r.right - 22 : r.left + 22) - left, w - 16));
		hint.classList.toggle('brx-hint-b', below);
		hint.style.setProperty('--ax', Math.round(ax) + 'px');
		hint.style.top = Math.round(top) + 'px';
		hint.style.left = Math.round(left) + 'px';
		hint.style.visibility = '';
	}
	function dismissHint(){
		clearTimeout(hintT); clearTimeout(hintAuto); clearInterval(hintIv);
		window.removeEventListener('resize', placeHint);
		document.removeEventListener('scroll', placeHint, true);
		if(!hint) return;
		var h = hint;
		h.classList.add('brx-hint-out');
		setTimeout(function(){ if(h.parentNode) h.parentNode.removeChild(h); }, 240);
		hint = null; hintLi = null;
	}
	function hintBoot(n){
		if(hintMainArmed || !hintOk()) return;
		var m = document.getElementById(MAIN_ID);
		if(m && m.querySelector('li.ch_logs')){ hintMainArmed = 1; armHint(m, 3000); return; }
		if(n < 120) setTimeout(function(){ hintBoot(n + 1); }, 1000);
	}

	/* fallback while the socket is down: refresh the newest messages now and then */
	var lastWs = null, lastPoll = 0;
	function tick(){
		watchAll();
		var ok = wsOk();
		if(lastWs === false && ok){ visible(); }
		lastWs = ok;
		if(ok || document.hidden) return;
		if(Date.now() - lastPoll < 12000) return;
		lastPoll = Date.now();
		visible();
	}
	window.BRX = { react: react, refresh: visible, hint: function(){ try { localStorage.removeItem(HK); localStorage.removeItem(HN); sessionStorage.removeItem(HS); } catch(e){} hintDone = 0; hintPage = 0; hintMainArmed = 0; hintList = null; hintBoot(0); }, _s: S, _m: MINE };
	$(function(){
		bind();
		watchAll();
		/* multi private-chat windows are added to <body> later */
		if(C.priv && window.MutationObserver){ new MutationObserver(function(){ watchAll(); }).observe(document.body, { childList: true }); }
		setTimeout(function(){ lastPoll = Date.now(); }, 0);
		setInterval(tick, 3000);
		hintBoot(0);
	});
})();
