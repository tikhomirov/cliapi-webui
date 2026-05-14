/**
 * @fileoverview Models view rendered via Alpine template.
 */

export function renderModels(container) {
	const tpl = document.getElementById('tpl-models-view');
	if (!tpl) {
		container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Models template is missing</div></div>';
		return;
	}

	container.innerHTML = '';
	container.appendChild(tpl.content.cloneNode(true));

	if (window.Alpine) {
		window.Alpine.initTree(container);
	}
}
