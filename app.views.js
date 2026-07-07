'use strict';

/* =========================================================
 * app.views.js - 画面定義
 * 1画面 = 1マーカーブロック。AIへの修正依頼はブロック単位で行い、
 * 返ってきたブロックをマーカー検索で貼り替える。
 * ルール: ai-first-rules.md 参照
 * ========================================================= */

const Views = {};

/* ===== [V:home] ここから ===== */
/* ホーム画面：カテゴリ別チップ、最近使ったプロンプト3件、チェックリストショートカット */
Views['/'] = () => {
  const prompts = state.get('prompts') || [];
  const categories = state.get('categories') || [];
  const recentPrompts = prompts
    .filter((p) => p.usedAt)
    .sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt))
    .slice(0, 3);

  const renderCategoryChip = (cat) => {
    const count = prompts.filter((p) => p.category === cat).length;
    return `
      <button class="x-chip" data-nav="/prompts?category=${encodeURIComponent(cat)}">
        ${esc(cat)} <span class="x-badge">${count}</span>
      </button>
    `;
  };

  const renderRecentPrompt = (p) => `
    <div class="x-card-stat">
      <div class="x-card-stat-header">
        <span class="x-card-stat-title">${esc(p.title)}</span>
        <span class="x-badge-sm">${esc(p.category)}</span>
      </div>
      <button class="btn btn-sm" data-nav="/prompt/${encodeURIComponent(p.id)}">詳細を見る</button>
    </div>
  `;

  return `
    <section class="card">
      <h2>🏠 ホーム</h2>
      <p class="sub">スマホ開発用プロンプトをワンタップでコピー。</p>

      <div class="section-header">
        <h3>📂 カテゴリ</h3>
      </div>
      <div class="x-chips-horizontal">
        ${categories.map(renderCategoryChip).join('')}
      </div>

      ${recentPrompts.length > 0 ? `
        <div class="section-header" style="margin-top: 24px;">
          <h3>⏰ 最近使ったプロンプト</h3>
        </div>
        <div class="x-stack">
          ${recentPrompts.map(renderRecentPrompt).join('')}
        </div>
      ` : ''}

      <div class="section-header" style="margin-top: 24px;">
        <h3>📋 公開前チェックリスト</h3>
      </div>
      <button class="btn btn-primary btn-block" data-nav="/checklist">チェックリストを開く</button>
    </section>
  `;
};
/* ===== [V:home] ここまで ===== */

/* ===== [V:prompts] ここから ===== */
/* プロンプト一覧：検索・カテゴリ絞り込み・FAB */
Views['/prompts'] = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const filterCategory = urlParams.get('category') || '';
  const savedSearchQuery = state.get('searchQuery') || '';

  const prompts = state.get('prompts') || [];
  const categories = state.get('categories') || [];

  let filtered = prompts;
  if (filterCategory) {
    filtered = filtered.filter((p) => p.category === filterCategory);
  }

  const renderPromptItem = (p, isHidden = false) => `
    <div class="x-list-item" data-prompt-id="${esc(p.id)}" data-nav="/prompt/${encodeURIComponent(p.id)}" style="display: ${isHidden ? 'none' : ''};">
      <div class="x-list-item-header">
        <span class="x-list-item-title">${esc(p.title)}</span>
        <span class="x-badge-sm">${esc(p.category)}</span>
      </div>
      <p class="x-list-item-sub">${esc(p.body.substring(0, 60))}...</p>
    </div>
  `;

  // 初期表示時の絞り込み判定関数
  const shouldItemBeHidden = (item) => {
    if (!savedSearchQuery) return false;
    const title = item.title.toLowerCase();
    const body = item.body.toLowerCase();
    return !(title.includes(savedSearchQuery) || body.includes(savedSearchQuery));
  };

  requestAnimationFrame(() => {
    const form = document.getElementById('promptSearchForm');
    const input = form?.querySelector('[name="searchQuery"]');
    if (input) {
      input.addEventListener('input', (e) => {
        const query = (e.target.value || '').trim().toLowerCase();
        state.set('searchQuery', query);
        const items = form.querySelectorAll('.x-list-item');
        items.forEach((item) => {
          const title = item.querySelector('.x-list-item-title')?.textContent || '';
          const body = item.querySelector('.x-list-item-sub')?.textContent || '';
          const match = title.toLowerCase().includes(query) || body.toLowerCase().includes(query);
          item.style.display = match ? '' : 'none';
        });
      }, { passive: true });
    }
  });

  return `
    <section class="card" id="promptSearchForm">
      <h2>📋 プロンプト一覧</h2>

      <div class="form-group">
        <input
          type="text"
          class="form-input"
          name="searchQuery"
          placeholder="🔍 検索..."
          value="${esc(savedSearchQuery)}"
        />
      </div>

      <div class="x-chips-horizontal">
        <button class="x-chip ${!filterCategory ? 'x-chip-active' : ''}" data-nav="/prompts">
          すべて
        </button>
        ${categories.map((cat) => `
          <button class="x-chip ${filterCategory === cat ? 'x-chip-active' : ''}" data-nav="/prompts?category=${encodeURIComponent(cat)}">
            ${esc(cat)}
          </button>
        `).join('')}
      </div>

      ${filtered.length > 0 ? `
        <div class="x-list">
          ${filtered.map((p) => renderPromptItem(p, shouldItemBeHidden(p))).join('')}
        </div>
      ` : `
        <p class="empty">プロンプトが見つかりません</p>
      `}

      <button class="fab fab-primary" data-nav="/prompt/new" aria-label="新規作成">
        ➕
      </button>
    </section>
  `;
};
/* ===== [V:prompts] ここまで ===== */

/* ===== [V:prompt-new] ここから ===== */
/* 新規登録フォーム：AutoSave対応 */
Views['/prompt/new'] = () => {
  const categories = state.get('categories') || [];
  const draft = AutoSave.load('prompt-new-draft') || {};

  requestAnimationFrame(() => {
    AutoSave.bind(document.getElementById('promptNewForm'), 'prompt-new-draft');
  });

  return `
    <section class="card" id="promptNewForm">
      <h2>➕ プロンプト新規作成</h2>

      <div class="form-group">
        <label class="form-label" for="newTitle">タイトル</label>
        <input
          id="newTitle"
          type="text"
          class="form-input"
          name="title"
          placeholder="e.g. ① 【共通契約】るーる"
          value="${esc(draft.title || '')}"
          required
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="newCategory">カテゴリ</label>
        <select id="newCategory" class="form-select" name="category" required>
          <option value="">選択してください</option>
          ${categories.map((cat) => `
            <option value="${esc(cat)}" ${draft.category === cat ? 'selected' : ''}>
              ${esc(cat)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="newBody">プロンプト本文</label>
        <textarea
          id="newBody"
          class="form-textarea"
          name="body"
          rows="8"
          placeholder="プロンプト内容を入力..."
          required
        >${esc(draft.body || '')}</textarea>
      </div>

      <button class="btn btn-primary btn-block" data-action="prompt-add">作成</button>
    </section>
  `;
};
/* ===== [V:prompt-new] ここまで ===== */

/* ===== [V:prompt-detail] ここから ===== */
/* 詳細表示：巨大なコピーボタン・編集・削除メニュー */
Views['/prompt/:id'] = () => {
  const id = router.params.id || '';
  const prompts = state.get('prompts') || [];
  const prompt = prompts.find((p) => p.id === id);

  if (!prompt) {
    return `
      <section class="card">
        <h2>エラー</h2>
        <p class="sub">プロンプトが見つかりません</p>
        <button class="btn btn-primary btn-block" data-nav="/prompts">一覧に戻る</button>
      </section>
    `;
  }

  return `
    <section class="card">
      <h2>${esc(prompt.title)}</h2>
      <span class="x-badge">${esc(prompt.category)}</span>

      <div class="section-header" style="margin-top: 24px;">
        <h3>📝 プロンプト本文</h3>
      </div>
      <div class="x-card-code">
        <pre>${esc(prompt.body)}</pre>
      </div>

      <button
        class="btn btn-primary btn-block btn-large"
        data-action="prompt-copy"
        data-prompt-id="${esc(id)}"
        style="font-size: 18px; padding: 20px; margin-top: 24px;"
      >
        📋 ワンタップでコピー
      </button>

      <div class="x-sheet-trigger-group" style="margin-top: 16px;">
        <button class="btn btn-sm btn-outline" data-action="prompt-menu" data-prompt-id="${esc(id)}">
          ⋮ メニュー
        </button>
      </div>
    </section>
  `;
};
/* ===== [V:prompt-detail] ここまで ===== */

/* ===== [V:prompt-edit] ここから ===== */
/* 編集フォーム：AutoSave対応 */
Views['/prompt/edit/:id'] = () => {
  const id = router.params.id || '';
  const prompts = state.get('prompts') || [];
  const categories = state.get('categories') || [];
  const prompt = prompts.find((p) => p.id === id);

  if (!prompt) {
    return `
      <section class="card">
        <h2>エラー</h2>
        <p class="sub">プロンプトが見つかりません</p>
        <button class="btn btn-primary btn-block" data-nav="/prompts">一覧に戻る</button>
      </section>
    `;
  }

  requestAnimationFrame(() => {
    AutoSave.bind(document.getElementById('promptEditForm'), `prompt-edit-${id}-draft`);
  });

  return `
    <section class="card" id="promptEditForm">
      <h2>✏️ プロンプト編集</h2>

      <div class="form-group">
        <label class="form-label" for="editTitle">タイトル</label>
        <input
          id="editTitle"
          type="text"
          class="form-input"
          name="title"
          value="${esc(prompt.title)}"
          required
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="editCategory">カテゴリ</label>
        <select id="editCategory" class="form-select" name="category" required>
          ${categories.map((cat) => `
            <option value="${esc(cat)}" ${prompt.category === cat ? 'selected' : ''}>
              ${esc(cat)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="editBody">プロンプト本文</label>
        <textarea
          id="editBody"
          class="form-textarea"
          name="body"
          rows="8"
          required
        >${esc(prompt.body)}</textarea>
      </div>

      <button
        class="btn btn-primary btn-block"
        data-action="prompt-save-edit"
        data-prompt-id="${esc(id)}"
      >
        保存
      </button>
    </section>
  `;
};
/* ===== [V:prompt-edit] ここまで ===== */

/* ===== [V:checklist] ここから ===== */
/* 公開前チェックリスト：チェックボックス一覧・状態永続化 */
Views['/checklist'] = () => {
  const checkStates = state.get('checkStates') || {};
  const checklistItems = [
    { id: 'testing', label: '機能テストが完了している' },
    { id: 'ui', label: 'UIがスマートフォンで正常に動作している' },
    { id: 'accessibility', label: 'アクセシビリティ対応が完了している' },
    { id: 'performance', label: 'パフォーマンス最適化が完了している' },
    { id: 'offline', label: 'オフラインモードが動作している' },
    { id: 'errors', label: 'コンソールエラーが消えている' },
    { id: 'xss', label: 'XSS対策（esc()）が実装されている' },
    { id: 'indexeddb', label: 'IndexedDBへの保存が確認できている' },
    { id: 'sw', label: 'Service Workerの更新が機能している' },
    { id: 'manifest', label: 'manifest.jsonが正しく設定されている' },
    { id: 'version', label: 'version と CACHE_VERSION を更新した' },
    { id: 'review', label: '最終レビューが完了している' }
  ];

  const renderChecklistItem = (item) => {
    const isChecked = checkStates[item.id] || false;
    return `
      <div class="x-checklist-item">
        <input
          type="checkbox"
          class="form-checkbox"
          id="check-${esc(item.id)}"
          ${isChecked ? 'checked' : ''}
          data-action="checklist-toggle"
          data-item-id="${esc(item.id)}"
        />
        <label for="check-${esc(item.id)}" class="form-label-inline">
          ${esc(item.label)}
        </label>
      </div>
    `;
  };

  const completionRate = Math.round(
    (Object.values(checkStates).filter(Boolean).length / checklistItems.length) * 100
  );

  return `
    <section class="card">
      <h2>✅ 公開前チェックリスト</h2>

      <div class="x-card-stat-hero">
        <div class="x-card-stat-value">${completionRate}%</div>
        <div class="x-card-stat-label">完了率</div>
      </div>

      <div class="x-checklist">
        ${checklistItems.map(renderChecklistItem).join('')}
      </div>

      ${completionRate === 100 ? `
        <div class="x-success-message" style="margin-top: 24px;">
          🎉 すべてのチェックが完了しました！公開準備が整いました。
        </div>
      ` : ''}
    </section>
  `;
};
/* ===== [V:checklist] ここまで ===== */
