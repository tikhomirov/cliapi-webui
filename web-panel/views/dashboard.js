/**
 * @fileoverview Dashboard view rendered via Alpine template.
 */

export function renderDashboard(container) {
	const tpl = document.getElementById('tpl-dashboard-view');
	if (!tpl) {
		container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Dashboard template is missing</div></div>';
		return;
	}

	container.innerHTML = '';
	container.appendChild(tpl.content.cloneNode(true));

	if (window.Alpine) {
		window.Alpine.initTree(container);
	}
}
