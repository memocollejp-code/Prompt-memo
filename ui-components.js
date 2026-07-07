'use strict';

/* =========================================================
 * PWA Extensions - ui-components.js v1.0.0
 * Toast    : Toast.show(msg, {type, duration}) / success / error / info
 * Modal    : Modal.alert / Modal.confirm / Modal.open（Promiseベース）
 * BottomNav: BottomNav.init(items)（ハッシュルーターと自動連動）
 * 依存なし。ui-components.css とセットで読み込むこと。
 * ========================================================= */

/* ---------- Toast ---------- */
const Toast = (() => {
  let container = null;

  const ensureContainer = () => {
    if (!container || !container.isConnected) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  };

  const show = (message, { type = 'info', duration = 2500 } = {}) => {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    ensureContainer().appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el.classList.remove('is-visible');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 400);
    };

    const timer = setTimeout(remove, duration);
    el.addEventListener('click', () => {
      clearTimeout(timer);
      remove();
    });
    return remove;
  };

  return {
    show,
    info: (message, options) => show(message, { ...options, type: 'info' }),
    success: (message, options) => show(message, { ...options, type: 'success' }),
    error: (message, options) => show(message, { ...options, type: 'error' })
  };
})();

/* ---------- Modal ---------- */
const Modal = (() => {
  let active = null;

  const FOCUSABLE =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const textNode = (message) => {
    const p = document.createElement('p');
    p.textContent = message;
    return p;
  };

  /* content: HTML文字列 or Node / buttons: [{ label, value, variant }] */
  const open = ({ title = '', content = '', buttons, dismissible = true } = {}) =>
    new Promise((resolve) => {
      if (active) active.close(undefined);

      const btnDefs =
        Array.isArray(buttons) && buttons.length > 0
          ? buttons
          : [{ label: 'OK', value: true, variant: 'primary' }];

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      if (title) {
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.textContent = title;
        modal.appendChild(header);
      }

      const body = document.createElement('div');
      body.className = 'modal-body';
      if (content instanceof Node) body.appendChild(content);
      else body.innerHTML = content;
      modal.appendChild(body);

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      btnDefs.forEach((def) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'modal-btn' + (def.variant ? ` modal-btn-${def.variant}` : '');
        btn.textContent = def.label;
        btn.addEventListener('click', () => close(def.value));
        footer.appendChild(btn);
      });
      modal.appendChild(footer);
      backdrop.appendChild(modal);

      const prevOverflow = document.body.style.overflow;
      const prevFocus = document.activeElement;

      const onKeydown = (e) => {
        if (e.key === 'Escape' && dismissible) {
          close(undefined);
          return;
        }
        if (e.key !== 'Tab') return;
        const focusables = modal.querySelectorAll(FOCUSABLE);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };

      const close = (result) => {
        if (!active || active.backdrop !== backdrop) return;
        active = null;
        document.removeEventListener('keydown', onKeydown);
        document.body.style.overflow = prevOverflow;
        backdrop.classList.remove('is-visible');
        const remove = () => backdrop.remove();
        backdrop.addEventListener('transitionend', remove, { once: true });
        setTimeout(remove, 300);
        if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
        resolve(result);
      };

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop && dismissible) close(undefined);
      });
      document.addEventListener('keydown', onKeydown);
      document.body.style.overflow = 'hidden';
      document.body.appendChild(backdrop);

      requestAnimationFrame(() => {
        backdrop.classList.add('is-visible');
        const firstBtn = footer.querySelector('button');
        if (firstBtn) firstBtn.focus();
      });

      active = { backdrop, close };
    });

  const alert = (message, { title = '', okText = 'OK' } = {}) =>
    open({
      title,
      content: textNode(message),
      buttons: [{ label: okText, value: true, variant: 'primary' }]
    }).then(() => undefined);

  const confirm = (
    message,
    { title = '', okText = 'OK', cancelText = 'キャンセル', danger = false } = {}
  ) =>
    open({
      title,
      content: textNode(message),
      buttons: [
        { label: cancelText, value: false },
        { label: okText, value: true, variant: danger ? 'danger' : 'primary' }
      ]
    }).then((result) => result === true);

  const closeActive = () => {
    if (active) active.close(undefined);
  };

  return { open, alert, confirm, close: closeActive };
})();

/* ---------- BottomNav ---------- */
const BottomNav = (() => {
  let nav = null;

  const currentPath = () => (location.hash.slice(1) || '/').split('?')[0];

  const sync = () => {
    if (!nav) return;
    const current = currentPath();
    nav.querySelectorAll('.bottom-nav-item').forEach((btn) => {
      const path = btn.dataset.path;
      const isActive = current === path || (path !== '/' && current.startsWith(path + '/'));
      btn.classList.toggle('is-active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  };

  /* items: [{ path: '/', label: 'ホーム', icon: '🏠' }] */
  const init = (items, { onNavigate } = {}) => {
    destroy();
    nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'メインナビゲーション');

    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bottom-nav-item';
      btn.dataset.path = item.path;

      const icon = document.createElement('span');
      icon.className = 'bottom-nav-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.icon || '';

      const label = document.createElement('span');
      label.className = 'bottom-nav-label';
      label.textContent = item.label;

      btn.append(icon, label);
      nav.appendChild(btn);
    });

    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.bottom-nav-item');
      if (!btn) return;
      const path = btn.dataset.path;
      if (typeof onNavigate === 'function') onNavigate(path);
      else location.hash = '#' + path;
    });

    document.body.appendChild(nav);
    document.body.classList.add('has-bottom-nav');
    window.addEventListener('hashchange', sync);
    sync();
    return nav;
  };

  const destroy = () => {
    if (!nav) return;
    window.removeEventListener('hashchange', sync);
    nav.remove();
    nav = null;
    document.body.classList.remove('has-bottom-nav');
  };

  return { init, sync, destroy };
})();
