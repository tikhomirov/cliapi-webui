/**
 * @fileoverview Config view rendered via Alpine template.
 */

export function renderConfig(container) {
	const tpl = document.getElementById('tpl-config-view');
	if (!tpl) {
		container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Config template is missing</div></div>';
		return;
	}

	container.innerHTML = '';
	container.appendChild(tpl.content.cloneNode(true));

	if (window.Alpine) {
		window.Alpine.initTree(container);
	}
}
