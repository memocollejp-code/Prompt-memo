'use strict';

/* =========================================================
 * app.actions.js - 操作定義
 * HTML側の data-action="名詞-動詞" がここに届く。
 * 1操作 = 1マーカーブロック。命名は「対象-操作」(例: note-add)。
 * ルール: ai-first-rules.md 参照
 * ========================================================= */

const Actions = {};

/* ===== [A:prompt-copy] ここから ===== */
/* プロンプト本文をクリップボードにコピー */
Actions['prompt-copy'] = (el) => {
  const id = el.getAttribute('data-prompt-id');
  const prompts = state.get('prompts') || [];
  const prompt = prompts.find((p) => p.id === id);

  if (!prompt) {
    Toast.error('プロンプトが見つかりません');
    return;
  }

  navigator.clipboard.writeText(prompt.body).then(() => {
    // usedAt を更新
    prompt.usedAt = new Date().toISOString();
    state.set('prompts', prompts);
    Toast.success('コピーしました ✓');
    router.refresh();
  }).catch(() => {
    Toast.error('コピーに失敗しました');
  });
};
/* ===== [A:prompt-copy] ここまで ===== */

/* ===== [A:prompt-add] ここから ===== */
/* 新規プロンプトを作成・保存 */
Actions['prompt-add'] = (el) => {
  const form = document.getElementById('promptNewForm');
  if (!form) return;

  const title = (form.querySelector('[name="title"]')?.value || '').trim();
  const category = (form.querySelector('[name="category"]')?.value || '').trim();
  const body = (form.querySelector('[name="body"]')?.value || '').trim();

  if (!title || !category || !body) {
    Toast.error('すべてのフィールドを入力してください');
    return;
  }

  const prompts = state.get('prompts') || [];
  const newPrompt = {
    id: crypto.randomUUID(),
    title,
    category,
    body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usedAt: null
  };

  prompts.push(newPrompt);
  state.set('prompts', prompts);
  AutoSave.clear('prompt-new-draft');
  Toast.success('プロンプトを作成しました');
  router.navigate('/prompts');
};
/* ===== [A:prompt-add] ここまで ===== */

/* ===== [A:prompt-save-edit] ここから ===== */
/* 既存プロンプトを編集・保存 */
Actions['prompt-save-edit'] = (el) => {
  const id = el.getAttribute('data-prompt-id');
  const form = document.getElementById('promptEditForm');
  if (!form) return;

  const title = (form.querySelector('[name="title"]')?.value || '').trim();
  const category = (form.querySelector('[name="category"]')?.value || '').trim();
  const body = (form.querySelector('[name="body"]')?.value || '').trim();

  if (!title || !category || !body) {
    Toast.error('すべてのフィールドを入力してください');
    return;
  }

  const prompts = state.get('prompts') || [];
  const promptIndex = prompts.findIndex((p) => p.id === id);

  if (promptIndex === -1) {
    Toast.error('プロンプトが見つかりません');
    return;
  }

  prompts[promptIndex].title = title;
  prompts[promptIndex].category = category;
  prompts[promptIndex].body = body;
  prompts[promptIndex].updatedAt = new Date().toISOString();

  state.set('prompts', prompts);
  AutoSave.clear(`prompt-edit-${id}-draft`);
  Toast.success('プロンプトを保存しました');
  router.navigate(`/prompt/${id}`);
};
/* ===== [A:prompt-save-edit] ここまで ===== */

/* ===== [A:prompt-delete] ここから ===== */
/* プロンプトを削除 */
Actions['prompt-delete'] = (el) => {
  const id = el.getAttribute('data-prompt-id');
  const prompts = state.get('prompts') || [];
  const promptIndex = prompts.findIndex((p) => p.id === id);

  if (promptIndex === -1) {
    Toast.error('プロンプトが見つかりません');
    return;
  }

  if (confirm('このプロンプトを削除してもよろしいですか？')) {
    prompts.splice(promptIndex, 1);
    state.set('prompts', prompts);
    Toast.success('プロンプトを削除しました');
    Modal.close();
    router.navigate('/prompts');
  }
};
/* ===== [A:prompt-delete] ここまで ===== */

/* ===== [A:prompt-menu] ここから ===== */
/* プロンプト詳細のメニューを表示 */
Actions['prompt-menu'] = (el) => {
  const id = el.getAttribute('data-prompt-id');

  Modal.show(`
    <h3 class="modal-title">メニュー</h3>
    <div class="x-sheet-menu">
      <button
        class="x-sheet-menu-item"
        data-nav="/prompt/edit/${encodeURIComponent(id)}"
        data-nav-close="true"
      >
        ✏️ 編集
      </button>
      <button
        class="x-sheet-menu-item x-sheet-menu-item-danger"
        data-action="prompt-delete"
        data-prompt-id="${encodeURIComponent(id)}"
        data-nav-close="false"
      >
        🗑️ 削除
      </button>
      <button class="x-sheet-menu-item" data-action="modal-close">
        キャンセル
      </button>
    </div>
  `);
};
/* ===== [A:prompt-menu] ここまで ===== */

/* ===== [A:checklist-toggle] ここから ===== */
/* チェックリストのチェック状態を切り替え */
Actions['checklist-toggle'] = (el) => {
  const itemId = el.getAttribute('data-item-id');
  const checkStates = state.get('checkStates') || {};

  checkStates[itemId] = el.checked;
  state.set('checkStates', checkStates);
  router.refresh();
};
/* ===== [A:checklist-toggle] ここまで ===== */

/* ===== [A:prompts-search-input] ここから ===== */
/* プロンプト一覧の検索入力 */
Actions['prompts-search-input'] = (el) => {
  const query = (el.value || '').trim().toLowerCase();
  state.set('searchQuery', query);
};
/* ===== [A:prompts-search-input] ここまで ===== */

/* ===== [A:modal-close] ここから ===== */
/* モーダルを閉じる */
Actions['modal-close'] = () => {
  Modal.close();
};
/* ===== [A:modal-close] ここまで ===== */
