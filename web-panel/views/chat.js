/**
 * @fileoverview Chat view rendered via Alpine template.
 */

export function renderChat(container) {
	const tpl = document.getElementById('tpl-chat-view');
	if (!tpl) {
		container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Chat template is missing</div></div>';
		return;
	}

	container.innerHTML = '';
	container.appendChild(tpl.content.cloneNode(true));

	if (window.Alpine) {
		window.Alpine.initTree(container);
	}
}
