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
  version: 'v1.1.0',
  dbName: 'prompt-guide-pwa',
  /* ===== [C:meta] ここまで ===== */

  /* ===== [C:schema] ここから ===== */
  /* ▼スキーマ表（データ構造はここだけが正）
   * prompts : Array<{ id:string, title:string, category:string, body:string, createdAt:string(ISO), updatedAt:string(ISO), usedAt:string(ISO) }>
   * categories : Array<string>
   * checkStates : Object<string, boolean> (release-checklist のチェック状態)
   */
  schemaVersion: 1,
  migrations: {
    /* 例）schemaVersionを2にした場合:
    2: (data) => {
      (data.prompts || []).forEach((r) => { if (r.tag === undefined) r.tag = ''; });
      return data;
    }
    */
  },
  initialState: {
    prompts: [
      {
        id: 'rule-base',
        title: '① 【共通契約】るーる',
        category: '共通',
        body: '【出力ルール:厳守】\n1. 修正が必要なマーカーブロック（/* ===== ここから ===== */ の塊）のみを省略せず全文出力せよ。\n2. それ以外の変更のないコードやファイル全体は一切出力するな。\n3. 「//残りのコード」等のサボり記述は一文字たりとも禁止する。',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usedAt: null
      },
      {
        id: 'rule-feature',
        title: '② 【機能追加】きのう',
        category: '機能追加',
        body: '【機能追加】\n添付したファイルの構造、データ構造（state）、既存のx-uiクラスと調和するように、指定の修正ブロックのみを出力して機能を追加してください。\n\n【追加したい内容】\n',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usedAt: null
      },
      {
        id: 'rule-bug',
        title: '③ 【バグ修正】ばぐ',
        category: 'バグ修正',
        body: '【バグ修正】\n添付したファイルで以下の不具合が発生しました。原因を特定し、指定の修正ブロックのみを出力して修正してください。\n\n【エラー内容や意図しない挙動】\n',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usedAt: null
      },
      {
        id: 'rule-ui',
        title: '④ 【UIデザイン改善】うい',
        category: 'UI改善',
        body: '【UIデザイン改善】\n添付したファイルのHTML構造を改善してください。\n\n【条件:厳守】\n1. 新しい独自CSSの追加や、style属性での色指定・直書きは一切禁止。\n2. 導入済みの「x-ui.css」のクラス（x-card-stat-hero、x-btn-gradなど）や、基盤のデザイントークン（--accent、--surfaceなど）のみを組み合わせて美しく装飾すること。\n3. 修正が必要なマーカーブロックのみを出力してください。',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usedAt: null
      }
    ],
    categories: ['共通', '機能追加', 'バグ修正', 'UI改善', 'その他'],
    checkStates: {}
  },
  /* インポート時のバリデーション（true か エラーメッセージ文字列を返す） */
  validateImport: (data) => {
    if (typeof data !== 'object' || data === null) return 'データ形式が不正です';
    if ('prompts' in data && !Array.isArray(data.prompts)) {
      return 'prompts は配列である必要があります';
    }
    if ('categories' in data && !Array.isArray(data.categories)) {
      return 'categories は配列である必要があります';
    }
    if ('checkStates' in data && typeof data.checkStates !== 'object') {
      return 'checkStates はオブジェクトである必要があります';
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
  /* BottomNavを使う場合はここに配列を指定（使わないなら null） */
  bottomNav: [
    { path: '/', label: 'ホーム', icon: '🏠' },
    { path: '/prompts', label: '一覧', icon: '📋' },
    { path: '/checklist', label: 'チェック', icon: '✅' }
  ],
  /* ===== [C:nav] ここまで ===== */

  /* ===== [C:ready] ここから ===== */
  /* 起動完了後に1回呼ばれる */
  onReady: () => {
    // 初期化処理（必要に応じて）
  }
  /* ===== [C:ready] ここまで ===== */
};

App.start(APP_CONFIG);
