export const REMOTE_PAGE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DnS Video Converter — Remote</title>
<style>
  :root {
    --bg: #f5f6f8; --panel: #fff; --border: #dde1e6; --text: #1b1f24; --muted: #6b7280;
    --accent: #2f6fed; --ok: #00805a; --danger: #c1440e;
    --ok-bg: #e2f5ee; --danger-bg: #fbe9e2;
    --log-bg: #14181f; --log-text: #d7dce2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17191d; --panel: #202329; --border: #33373f; --text: #eef0f2; --muted: #9aa1ab;
      --accent: #5b8bf0; --ok: #37d6a3; --danger: #ff9a52;
      --ok-bg: #123529; --danger-bg: #3a2415;
      --log-bg: #0e1013; --log-text: #c6ccd4;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
  }
  .tree-sidebar {
    flex-shrink: 0; width: 260px; min-width: 160px; max-width: 500px;
    display: flex; flex-direction: column; border-right: 1px solid var(--border); background: var(--panel);
  }
  .tree-sidebar-head {
    padding: 10px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; color: var(--muted); border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .tree-container { flex: 1; overflow: auto; padding: 4px 0; }
  .tree-row {
    display: flex; align-items: center; gap: 5px; padding: 5px 8px; cursor: pointer;
    font-size: 12.5px; white-space: nowrap; user-select: none;
  }
  .tree-row:hover { background: var(--bg); }
  .tree-row .arrow { flex-shrink: 0; width: 12px; font-size: 10px; color: var(--muted); }
  .tree-row .icon { flex-shrink: 0; }
  .tree-row .name { overflow: hidden; text-overflow: ellipsis; }
  .tree-empty { padding: 12px; font-size: 12px; color: var(--muted); }
  .resize-handle {
    flex-shrink: 0; width: 5px; cursor: col-resize; background: transparent;
  }
  .resize-handle:hover, .resize-handle.active { background: var(--accent); }
  .main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .main-header { flex-shrink: 0; padding: 16px 16px 0; }
  .main-scroll { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
  .top-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .conn { font-size: 12px; color: var(--muted); }
  .conn.offline { color: var(--danger); }
  .stats { font-size: 11.5px; color: var(--muted); display: flex; gap: 12px; font-variant-numeric: tabular-nums; }
  .hint { font-size: 12px; color: var(--muted); margin: 10px 0 14px; }
  .filters { display: flex; gap: 6px; margin-bottom: 14px; }
  .filters button {
    padding: 5px 12px; font-size: 12.5px; background: var(--panel); border: 1px solid var(--border);
    border-radius: 999px; color: var(--muted);
  }
  .filters button.active { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  .confirm-bar {
    display: flex; flex-direction: column; gap: 8px; background: var(--panel); border-top: 2px solid var(--accent);
    padding: 10px 12px; font-size: 12.5px; position: sticky; bottom: 0; z-index: 5;
    box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.12);
  }
  .confirm-bar .msg { word-break: break-all; }
  .confirm-bar .btn-row { display: flex; gap: 8px; }
  .confirm-bar .btn-row button { flex: 1; }
  .task {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
    padding: 14px; margin-bottom: 14px; cursor: pointer;
  }
  .task.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .task-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .task-head.collapsed { margin-bottom: 0; }
  .task-toggle {
    flex-shrink: 0; border: none; background: none; padding: 0 2px; font-size: 12px;
    line-height: 1; color: var(--muted); width: 16px;
  }
  .task-title { font-weight: 600; font-size: 15px; word-break: break-all; flex: 1; min-width: 0; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; flex-shrink: 0; }
  .badge.converting { background: var(--accent); color: #fff; }
  .badge.done { background: var(--ok-bg); color: var(--ok); }
  .badge.error { background: var(--danger-bg); color: var(--danger); }
  .badge.idle, .badge.ready, .badge.probing { background: var(--border); color: var(--muted); }
  .badge.force { background: var(--danger-bg); color: var(--danger); font-weight: 600; }
  .task-close {
    flex-shrink: 0; border: none; background: none; padding: 0 2px; font-size: 16px;
    line-height: 1; color: var(--muted);
  }
  .task-close:hover { color: var(--danger); }
  .meta { font-size: 12.5px; color: var(--muted); margin: 4px 0; word-break: break-all; line-height: 1.5; }
  .opts {
    display: flex; gap: 18px 22px; flex-wrap: wrap; align-items: flex-end; margin: 12px 0; cursor: default;
    padding: 12px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  }
  .opts label {
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
    color: var(--muted); display: flex; flex-direction: column; gap: 5px;
  }
  .opts input[type=text], .opts select {
    font-size: 13.5px; padding: 6px 9px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--panel); color: var(--text); min-height: 30px;
  }
  .opts input[type=text] { width: 78px; }
  .opts select { min-width: 130px; }
  .opts .checkbox-opt {
    flex-direction: row; align-items: center; gap: 7px; font-size: 13px; font-weight: 500;
    text-transform: none; letter-spacing: normal; color: var(--text); padding-bottom: 6px;
  }
  .opts .checkbox-opt input[type=checkbox] { width: 15px; height: 15px; }
  .progress-track { height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; margin: 8px 0; }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.2s; }
  .collapsed-summary { margin-top: 8px; }
  .collapsed-summary-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 6px; }
  .meta-inline { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  button.small { padding: 3px 10px; font-size: 12px; flex-shrink: 0; }
  .result { font-size: 12.5px; padding: 8px 10px; border-radius: 6px; margin: 8px 0; }
  .result.success { background: var(--ok-bg); color: var(--ok); }
  .result.failure { background: var(--danger-bg); color: var(--danger); }
  .overwrite-warn {
    font-size: 12.5px; padding: 8px 10px; border-radius: 6px; margin: 8px 0;
    background: var(--danger-bg); color: var(--danger);
  }
  .actions { display: flex; gap: 8px; margin-top: 8px; }
  button {
    padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--panel); color: var(--text); cursor: pointer; font-size: 13px;
  }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  button.danger { background: var(--danger); border-color: var(--danger); color: #fff; font-weight: 600; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  details { margin-top: 8px; }
  summary { font-size: 12px; color: var(--muted); cursor: pointer; }
  .log {
    margin-top: 6px; background: var(--log-bg); color: var(--log-text); border-radius: 6px;
    padding: 8px 10px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px;
    max-height: 220px; overflow-y: auto; white-space: pre-wrap; word-break: break-all;
  }
  .empty { color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
  <aside class="tree-sidebar" id="treeSidebar">
    <div class="tree-sidebar-head">Files</div>
    <div class="tree-container" id="treeContainer"></div>
    <div id="confirmBar"></div>
  </aside>
  <div class="resize-handle" id="resizeHandle"></div>
  <main class="main-col">
    <div class="main-header">
      <div class="top-row">
        <div>
          <h1>DnS Video Converter — Remote</h1>
          <div class="conn" id="conn">Connecting…</div>
        </div>
        <div class="stats" id="stats"></div>
      </div>
      <div class="hint">Click a task to select it, then click a file on the left — you'll be asked to confirm before it's loaded in.</div>
      <div class="filters" id="filters">
        <button data-filter="all" class="active">All</button>
        <button data-filter="processing">Processing</button>
        <button data-filter="finished">Finished</button>
      </div>
    </div>
    <div class="main-scroll">
      <div id="tasks"><div class="empty">No tasks yet.</div></div>
    </div>
  </main>

<script>
(function () {
  var RESOLUTIONS = [
    ['original', 'Original'], ['360p', '360p'], ['480p', '480p'], ['576p', '576p'],
    ['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p'], ['4k', '4K (2160p)'],
    ['8k', '8K (4320p)'], ['custom', 'Custom…']
  ];

  var tasksEl = document.getElementById('tasks');
  var connEl = document.getElementById('conn');
  var statsEl = document.getElementById('stats');
  var confirmBarEl = document.getElementById('confirmBar');
  var filtersEl = document.getElementById('filters');
  var tasks = {};
  var order = [];
  var collapsed = {}; // taskId -> bool, explicit user override
  var logOpen = {}; // taskId -> bool, whether the log <details> is expanded
  var selectedTaskId = null;
  var pendingFile = null; // { path, taskId | null }
  var currentFilter = 'all';
  var ws = null;

  function statusLabel(s) {
    return { idle: 'Idle', probing: 'Probing…', ready: 'Ready', converting: 'Converting', done: 'Done', error: 'Error' }[s] || s;
  }

  function isFinished(t) {
    return t.status === 'done' || (t.status === 'error' && !!t.resultText);
  }

  function matchesFilter(t) {
    if (currentFilter === 'processing') return t.status === 'converting';
    if (currentFilter === 'finished') return isFinished(t);
    return true;
  }

  filtersEl.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-filter]');
    if (!btn) return;
    currentFilter = btn.getAttribute('data-filter');
    Array.prototype.forEach.call(filtersEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b === btn);
    });
    renderTasks();
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatBytes(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    var v = n / Math.pow(1024, i);
    return (i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)) + ' ' + units[i];
  }

  function renderConfirmBar() {
    if (!pendingFile) {
      confirmBarEl.innerHTML = '';
      return;
    }
    var targetTask = pendingFile.taskId ? tasks[pendingFile.taskId] : null;
    var targetLabel = targetTask ? '"' + escapeHtml(targetTask.title) + '"' : 'a new task';
    var fileName = pendingFile.path.split(/[\\\\/]/).pop();
    confirmBarEl.innerHTML =
      '<div class="confirm-bar">' +
        '<div class="msg">Load <strong>' + escapeHtml(fileName) + '</strong> into ' + targetLabel + '?</div>' +
        '<div class="btn-row"><button id="confirmYes" class="primary">Load</button>' +
        '<button id="confirmNo">Cancel</button></div>' +
      '</div>';
    document.getElementById('confirmYes').addEventListener('click', function () {
      var msg = { type: 'newTask', inputPath: pendingFile.path };
      if (pendingFile.taskId) msg.taskId = pendingFile.taskId;
      sendCmd(msg);
      pendingFile = null;
      renderConfirmBar();
    });
    document.getElementById('confirmNo').addEventListener('click', function () {
      pendingFile = null;
      renderConfirmBar();
    });
  }

  function updateFilterCounts() {
    var all = order.length;
    var processing = order.filter(function (id) { return tasks[id] && tasks[id].status === 'converting'; }).length;
    var finished = order.filter(function (id) { return tasks[id] && isFinished(tasks[id]); }).length;
    filtersEl.querySelector('[data-filter=all]').textContent = 'All (' + all + ')';
    filtersEl.querySelector('[data-filter=processing]').textContent = 'Processing (' + processing + ')';
    filtersEl.querySelector('[data-filter=finished]').textContent = 'Finished (' + finished + ')';
  }

  // Expanded by default while still being configured (so CRF etc. are
  // reachable) or while something needs the user's attention; collapsed
  // once conversion is underway to save space, but with a compact
  // progress/cancel summary still visible. Always overridable by hand.
  function defaultExpandedFor(id, t) {
    return !t.converting && (t.needsOverwriteConfirm || t.status === 'idle' || t.status === 'ready' || t.status === 'probing' || id === selectedTaskId);
  }

  function captureFocus() {
    var active = document.activeElement;
    if (!active || !tasksEl.contains(active) || !active.hasAttribute || !active.hasAttribute('data-opt')) {
      return null;
    }
    return {
      taskId: active.getAttribute('data-task'),
      opt: active.getAttribute('data-opt'),
      selStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      selEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    var el = tasksEl.querySelector('[data-task="' + saved.taskId + '"][data-opt="' + saved.opt + '"]');
    if (!el) return;
    el.focus();
    if (saved.selStart !== null && el.setSelectionRange) {
      try { el.setSelectionRange(saved.selStart, saved.selEnd); } catch (e) { /* not a text input */ }
    }
  }

  function renderTasks() {
    updateFilterCounts();
    if (order.length === 0) {
      tasksEl.innerHTML = '<div class="empty">No tasks yet.</div>';
      return;
    }
    var visibleIds = order.filter(function (id) { return tasks[id] && matchesFilter(tasks[id]); });
    if (visibleIds.length === 0) {
      tasksEl.innerHTML = '<div class="empty">No ' + currentFilter + ' tasks.</div>';
      return;
    }
    // Re-rendering replaces every task card's DOM wholesale, which would
    // otherwise steal focus/caret out from under someone mid-edit whenever
    // ANY task's state changes (e.g. another task's progress ticking).
    var savedFocus = captureFocus();
    tasksEl.innerHTML = visibleIds.map(function (id) {
      var t = tasks[id];
      if (!t) return '';
      var pct = t.progressPercent != null ? t.progressPercent.toFixed(1) + '%' : (t.converting ? '…' : '');
      var progressHtml = t.converting
        ? '<div class="progress-track"><div class="progress-fill" style="width:' + (t.progressPercent || 0) + '%"></div></div>' +
          '<div class="meta">' + (t.progressText || pct) + '</div>'
        : '';
      var resultHtml = t.resultText
        ? '<div class="result ' + (t.resultSuccess ? 'success' : 'failure') + '">' + escapeHtml(t.resultText) + '</div>'
        : '';
      var detectedHtml = t.detected ? '<div class="meta">' + escapeHtml(t.detected) + '</div>' : '';
      var outHtml = t.outputPath ? '<div class="meta">→ ' + escapeHtml(t.outputPath) + '</div>' : '';
      var planHtml = t.planSummary ? '<div class="meta">' + escapeHtml(t.planSummary) + '</div>' : '';
      // Conversion progress re-renders this card frequently; without tracking
      // open state explicitly, each re-render would recreate the <details>
      // closed, making it flash open and immediately collapse.
      var logHtml = t.logTail && t.logTail.length
        ? '<details' + (logOpen[id] ? ' open' : '') + '><summary>Log (' + t.logTail.length + ' lines)</summary><div class="log">' + escapeHtml(t.logTail.join('\\n')) + '</div></details>'
        : '';
      var convertDisabled = !t.canConvert || t.converting;
      var overwriteHtml = t.needsOverwriteConfirm
        ? '<div class="overwrite-warn">Output file already exists — converting will overwrite it.</div>'
        : '';
      var actionsHtml = t.converting
        ? '<div class="actions"><button class="danger" data-cancel="' + id + '">Cancel</button></div>'
        : t.needsOverwriteConfirm
          ? '<div class="actions"><button class="danger" data-overwrite="' + id + '">Overwrite &amp; Convert</button></div>'
          : '<div class="actions"><button class="primary" ' + (convertDisabled ? 'disabled' : '') + ' data-convert="' + id + '">Convert</button></div>';
      var selectedClass = id === selectedTaskId ? ' selected' : '';

      var resOptionsHtml = RESOLUTIONS.map(function (r) {
        return '<option value="' + r[0] + '"' + (r[0] === t.resolution ? ' selected' : '') + '>' + r[1] + '</option>';
      }).join('');

      var customResHtml = t.resolution === 'custom'
        ? '<label>Custom<input type="text" data-opt="customRes" data-task="' + id + '" value="' + escapeHtml(t.customRes || '') + '" placeholder="1920x1080"></label>'
        : '';

      var forceReencodeHtml = t.isHevc
        ? '<label class="checkbox-opt"><input type="checkbox" data-opt="forceReencode" data-task="' + id + '"' + (t.forceReencode ? ' checked' : '') + '> Force re-encode</label>'
        : '';

      var optsHtml =
        '<div class="opts">' +
          '<label>CRF<input type="text" data-opt="crf" data-task="' + id + '" value="' + escapeHtml(t.crf) + '"></label>' +
          '<label>Resolution<select data-opt="resolution" data-task="' + id + '">' + resOptionsHtml + '</select></label>' +
          customResHtml + forceReencodeHtml +
        '</div>';

      var isCollapsed = collapsed.hasOwnProperty(id) ? collapsed[id] : !defaultExpandedFor(id, t);
      var bodyHtml = isCollapsed
        ? ''
        : '<div class="task-body">' +
            detectedHtml + outHtml + planHtml + optsHtml +
            progressHtml + resultHtml + overwriteHtml + actionsHtml + logHtml +
          '</div>';
      var collapsedSummaryHtml = isCollapsed && t.converting
        ? '<div class="collapsed-summary">' +
            '<div class="progress-track"><div class="progress-fill" style="width:' + (t.progressPercent || 0) + '%"></div></div>' +
            '<div class="collapsed-summary-row">' +
              '<span class="meta-inline">' + escapeHtml(t.progressText || pct) + '</span>' +
              '<button type="button" class="danger small" data-cancel="' + id + '">Cancel</button>' +
            '</div>' +
          '</div>'
        : '';

      var forceBadgeHtml = t.isHevc && t.forceReencode
        ? '<span class="badge force" title="Re-encoding instead of stream-copying the already-HEVC source">Force</span>'
        : '';

      return '<div class="task' + selectedClass + '" data-select="' + id + '">' +
        '<div class="task-head">' +
        '<button type="button" class="task-toggle" data-toggle-card="' + id + '">' + (isCollapsed ? '▸' : '▾') + '</button>' +
        '<div class="task-title">' + escapeHtml(t.title) + '</div>' +
        forceBadgeHtml +
        '<span class="badge ' + t.status + '">' + statusLabel(t.status) + '</span>' +
        '<button type="button" class="task-close" data-close="' + id + '" title="Close task">×</button></div>' +
        collapsedSummaryHtml + bodyHtml +
        '</div>';
    }).join('');
    restoreFocus(savedFocus);
  }

  function currentOptsFor(id) {
    // Read from the live DOM, not the last server snapshot — the snapshot can
    // be stale relative to an edit the user just made in another field that
    // hasn't round-tripped yet.
    var t = tasks[id] || {};
    var card = tasksEl.querySelector('[data-select="' + id + '"]');
    if (!card) return { crf: t.crf, resolution: t.resolution, customRes: t.customRes, forceReencode: !!t.forceReencode };

    var crfEl = card.querySelector('[data-opt=crf]');
    var resEl = card.querySelector('[data-opt=resolution]');
    var customEl = card.querySelector('[data-opt=customRes]');
    var forceEl = card.querySelector('[data-opt=forceReencode]');
    return {
      crf: crfEl ? crfEl.value : t.crf,
      resolution: resEl ? resEl.value : t.resolution,
      customRes: customEl ? customEl.value : t.customRes,
      forceReencode: forceEl ? forceEl.checked : !!t.forceReencode
    };
  }

  tasksEl.addEventListener('click', function (ev) {
    var convertBtn = ev.target.closest('[data-convert]');
    var overwriteBtn = ev.target.closest('[data-overwrite]');
    var cancelBtn = ev.target.closest('[data-cancel]');
    var closeBtn = ev.target.closest('[data-close]');
    var toggleBtn = ev.target.closest('[data-toggle-card]');
    if (toggleBtn) {
      var toggleId = toggleBtn.getAttribute('data-toggle-card');
      var toggleTask = tasks[toggleId] || {};
      var wasCollapsed = collapsed.hasOwnProperty(toggleId) ? collapsed[toggleId] : !defaultExpandedFor(toggleId, toggleTask);
      collapsed[toggleId] = !wasCollapsed;
      renderTasks();
      return;
    }
    if (convertBtn) {
      sendCmd({ type: 'convert', taskId: convertBtn.getAttribute('data-convert') });
      return;
    }
    if (overwriteBtn) {
      sendCmd({ type: 'convert', taskId: overwriteBtn.getAttribute('data-overwrite'), confirmOverwrite: true });
      return;
    }
    if (cancelBtn) {
      sendCmd({ type: 'cancel', taskId: cancelBtn.getAttribute('data-cancel') });
      return;
    }
    if (closeBtn) {
      var closeId = closeBtn.getAttribute('data-close');
      var closeTask = tasks[closeId];
      var label = closeTask ? closeTask.title : 'this task';
      if (confirm('Close "' + label + '"? This cannot be undone.')) {
        sendCmd({ type: 'closeTask', taskId: closeId });
      }
      return;
    }
    if (ev.target.closest('.opts')) return; // let inputs handle their own events
    if (ev.target.closest('details')) return; // let the log <details> toggle itself
    var card = ev.target.closest('[data-select]');
    if (card) {
      selectedTaskId = card.getAttribute('data-select');
      renderTasks();
    }
  });

  // The 'toggle' event doesn't bubble, so listen in the capture phase instead.
  tasksEl.addEventListener('toggle', function (ev) {
    var details = ev.target;
    if (!details || details.tagName !== 'DETAILS') return;
    var card = details.closest('[data-select]');
    if (!card) return;
    logOpen[card.getAttribute('data-select')] = details.open;
  }, true);

  tasksEl.addEventListener('change', function (ev) {
    var el = ev.target.closest('[data-opt]');
    if (!el) return;
    var id = el.getAttribute('data-task');
    var opt = el.getAttribute('data-opt');
    var opts = currentOptsFor(id);
    if (opt === 'forceReencode') opts.forceReencode = el.checked;
    else opts[opt] = el.value;
    sendCmd({
      type: 'setOptions', taskId: id,
      crf: opts.crf, resolution: opts.resolution, customRes: opts.customRes, forceReencode: opts.forceReencode
    });
  });

  function sendCmd(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/ws');
    ws.onopen = function () {
      connEl.textContent = 'Connected';
      connEl.className = 'conn';
    };
    ws.onclose = function () {
      connEl.textContent = 'Disconnected — retrying…';
      connEl.className = 'conn offline';
      setTimeout(connect, 2000);
    };
    ws.onerror = function () { ws.close(); };
    ws.onmessage = function (ev) {
      var msg = JSON.parse(ev.data);
      if (msg.type === 'snapshot') {
        tasks = {};
        order = [];
        msg.tasks.forEach(function (t) { tasks[t.taskId] = t; order.push(t.taskId); });
        renderTasks();
      } else if (msg.type === 'update') {
        if (!(msg.task.taskId in tasks)) order.push(msg.task.taskId);
        tasks[msg.task.taskId] = msg.task;
        renderTasks();
      } else if (msg.type === 'remove') {
        delete tasks[msg.taskId];
        order = order.filter(function (id) { return id !== msg.taskId; });
        if (selectedTaskId === msg.taskId) selectedTaskId = null;
        renderTasks();
      } else if (msg.type === 'stats') {
        statsEl.innerHTML = '<span>CPU ' + msg.cpuPercent.toFixed(0) + '%</span>' +
          '<span>↓' + formatBytes(msg.netRxBps) + '/s ↑' + formatBytes(msg.netTxBps) + '/s</span>';
      }
    };
  }

  connect();

  // --- Persistent file tree sidebar ---
  var treeContainer = document.getElementById('treeContainer');
  var treeCache = {};   // path -> entries[]
  var expanded = {};    // path -> bool
  var rootEntries = [];

  function loadRoots() {
    fetch('/api/browse')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        rootEntries = data.entries || [];
        renderTree();
      })
      .catch(function () {
        treeContainer.innerHTML = '<div class="tree-empty">Could not load folders.</div>';
      });
  }

  function renderTree() {
    if (rootEntries.length === 0) {
      treeContainer.innerHTML = '<div class="tree-empty">No folders configured. Add some in Settings on the desktop app.</div>';
      return;
    }
    treeContainer.innerHTML = renderNodes(rootEntries, 0);
  }

  function renderNodes(entries, depth) {
    return entries.map(function (e) {
      var pad = depth * 16 + 8;
      if (e.isDir) {
        var isOpen = !!expanded[e.path];
        var childrenHtml = '';
        if (isOpen && treeCache[e.path]) {
          childrenHtml = renderNodes(treeCache[e.path], depth + 1);
        }
        return '<div class="tree-row" style="padding-left:' + pad + 'px" data-toggle="' + escapeHtml(e.path) + '">' +
          '<span class="arrow">' + (isOpen ? '▾' : '▸') + '</span>' +
          '<span class="icon">📁</span><span class="name">' + escapeHtml(e.name) + '</span>' +
        '</div>' + childrenHtml;
      }
      return '<div class="tree-row" style="padding-left:' + pad + 'px" data-file="' + escapeHtml(e.path) + '">' +
        '<span class="arrow"></span><span class="icon">🎬</span><span class="name">' + escapeHtml(e.name) + '</span>' +
      '</div>';
    }).join('');
  }

  treeContainer.addEventListener('click', function (ev) {
    var toggleEl = ev.target.closest('[data-toggle]');
    var fileEl = ev.target.closest('[data-file]');
    if (toggleEl) {
      var p = toggleEl.getAttribute('data-toggle');
      if (expanded[p]) {
        expanded[p] = false;
        renderTree();
        return;
      }
      expanded[p] = true;
      if (treeCache[p]) {
        renderTree();
        return;
      }
      fetch('/api/browse?path=' + encodeURIComponent(p))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            alert(data.error);
            expanded[p] = false;
            return;
          }
          treeCache[p] = data.entries;
          renderTree();
        });
      return;
    }
    if (fileEl) {
      var path = fileEl.getAttribute('data-file');
      var current = selectedTaskId ? tasks[selectedTaskId] : null;
      pendingFile = { path: path, taskId: (current && !current.inputPath) ? selectedTaskId : null };
      renderConfirmBar();
    }
  });

  loadRoots();

  // --- Resizable sidebar ---
  var sidebar = document.getElementById('treeSidebar');
  var handle = document.getElementById('resizeHandle');
  var dragging = false;
  handle.addEventListener('mousedown', function (e) {
    dragging = true;
    handle.classList.add('active');
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var w = Math.max(160, Math.min(500, e.clientX));
    sidebar.style.width = w + 'px';
  });
  window.addEventListener('mouseup', function () {
    dragging = false;
    handle.classList.remove('active');
  });
})();
</script>
</body>
</html>
`
