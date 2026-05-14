/**
 * @fileoverview Providers view rendered via Alpine template.
 */

export function renderProviders(container) {
	const tpl = document.getElementById('tpl-providers-view');
	if (!tpl) {
		container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Providers template is missing</div></div>';
		return;
	}

	container.innerHTML = '';
	container.appendChild(tpl.content.cloneNode(true));

	if (window.Alpine) {
		window.Alpine.initTree(container);
	}
}
