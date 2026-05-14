/**
 * @fileoverview Keys & Auth view rendered via Alpine template.
 */

export function renderKeys(container) {
	const tpl = document.getElementById('tpl-keys-view');
	if (!tpl) {
		container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Keys template is missing</div></div>';
		return;
	}

	container.innerHTML = '';
	container.appendChild(tpl.content.cloneNode(true));

	if (window.Alpine) {
		window.Alpine.initTree(container);
	}
}
