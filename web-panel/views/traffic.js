/**
 * @fileoverview Traffic view rendered via Alpine template.
 */

export function renderTraffic(container) {
	const tpl = document.getElementById('tpl-traffic-view');
	if (!tpl) {
		container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Traffic template is missing</div></div>';
		return;
	}

	container.innerHTML = '';
	container.appendChild(tpl.content.cloneNode(true));

	if (window.Alpine) {
		window.Alpine.initTree(container);
	}
}
