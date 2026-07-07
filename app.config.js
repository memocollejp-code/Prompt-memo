'use strict';

/* =========================================================
 * app.config.js - 設定と起動（読み込み順の最後）
 * データ構造の説明は [C:schema] のスキーマ表だけが正。
 * バージョンアップ時: [C:meta] の version と sw.js の CACHE_VERSION を
 * 必ずセットで上げる。
 * ========================================================= */

/* XSS対策：ユーザー入力をHTMLへ埋め込む際は必ずこれを通す */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const APP_CONFIG = {
  /* ===== [C:meta] ここから ===== */
  appName: 'プロンプトメモ',
  version: 'v1.2.0',
  dbName: 'prompt-memo', // アプリごとに必ず一意にする（IndexedDBのDB名）
  /* ===== [C:meta] ここまで ===== */

  /* ===== [C:schema] ここから ===== */
  /* ▼スキーマ表（データ構造はここだけが正）
   * launchCount : number 起動回数
   */
  schemaVersion: 1,
  migrations: {
    /* 例）schemaVersionを2にした場合:
    2: (data) => {
      (data.records || []).forEach((r) => { if (r.tag === undefined) r.tag = ''; });
      return data;
    }
    */
  },
  initialState: {
    launchCount: 0
  },
  /* インポート時のバリデーション（true か エラーメッセージ文字列を返す） */
  validateImport: (data) => {
    if (typeof data !== 'object' || data === null) return 'データ形式が不正です';
    if ('launchCount' in data && typeof data.launchCount !== 'number') {
      return 'launchCount の形式が不正です';
    }
    return true;
  },
  /* ===== [C:schema] ここまで ===== */

  /* ---- 固定配線（改変禁止）：画面は app.views.js、操作は app.actions.js に書く ---- */
  routes: Views,
  onAction: (action, el, e) => {
    const fn = Actions[action];
    if (fn) fn(el, e);
  },

  /* ===== [C:nav] ここから ===== */
  /* BottomNavを使う場合はここに配列を指定（使わないなら null）
     例: [{ path: '/', label: 'ホーム', icon: '🏠' }, { path: '/settings', label: '設定', icon: '⚙️' }] */
  bottomNav: null,
  /* ===== [C:nav] ここまで ===== */

  /* ===== [C:ready] ここから ===== */
  /* 起動完了後に1回呼ばれる */
  onReady: () => {
    state.set('launchCount', (state.get('launchCount') || 0) + 1);
  }
  /* ===== [C:ready] ここまで ===== */
};

App.start(APP_CONFIG);
