'use strict';

/* =========================================================
 * PWA Ultimate Template - app.js v1.1.0
 * アプリ固有部分。新しいアプリを作るときは【このファイルだけ】を
 * 書き換える。core.js / index.html / sw.js の本体は改変禁止。
 *
 * バージョンアップ時にやること:
 *   1. 下記 APP_CONFIG.version を上げる
 *   2. sw.js の CACHE_VERSION を同じ番号に上げる
 * ========================================================= */

/* XSS対策：ユーザー入力をHTMLへ埋め込む際は必ずこれを通す */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const APP_CONFIG = {
  appName: 'PWA Starter',
  version: 'v1.1.0',
  dbName: 'pwa-starter', // アプリごとに必ず一意にする（IndexedDBのDB名）

  /* データ構造を変えたら schemaVersion を上げ、migrations に変換処理を追加 */
  schemaVersion: 1,
  migrations: {
    /* 例）v2にした場合:
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

  /* ---------- 画面定義（ここを書き換えてアプリを作る） ---------- */
  routes: {
    '/': () => `
      <section class="card">
        <h2>ホーム</h2>
        <p class="sub">テンプレートは正常に動作しています（起動 ${state.get('launchCount')} 回目）。</p>
        <p class="sub">データはIndexedDBに自動保存され、オフラインでも動作します。</p>
        <button class="btn btn-primary btn-block" data-nav="/sample">サンプル画面へ</button>
        <button class="btn btn-block" data-nav="/settings">⚙️ 設定</button>
      </section>
    `,

    '/sample': () => {
      /* AutoSave の使用例：入力途中の内容がリロードしても消えない */
      requestAnimationFrame(() => {
        AutoSave.bind(document.getElementById('sampleForm'), 'sample-draft');
      });
      return `
        <section class="card" id="sampleForm">
          <h2>サンプル画面（自動保存デモ）</h2>
          <p class="sub">入力してからリロードしても内容が復元されます。</p>
          <div class="form-group">
            <label class="form-label" for="sampleMemo">メモ</label>
            <textarea id="sampleMemo" class="form-textarea" name="memo" rows="4" placeholder="入力途中でも自動保存されます"></textarea>
          </div>
          <button class="btn btn-primary btn-block" data-action="sample-clear-draft">下書きをクリア</button>
        </section>
      `;
    }
  },

  /* data-action のハンドリング（設定画面のアクションはcore側で処理済み） */
  onAction: (action) => {
    if (action === 'sample-clear-draft') {
      AutoSave.clear('sample-draft');
      Toast.success('下書きを削除しました');
      router.refresh();
    }
  },

  /* BottomNavを使う場合はここに配列を指定（使わないなら null）
     例: [{ path: '/', label: 'ホーム', icon: '🏠' }, { path: '/settings', label: '設定', icon: '⚙️' }] */
  bottomNav: null,

  /* 起動完了後に1回呼ばれる */
  onReady: () => {
    state.set('launchCount', (state.get('launchCount') || 0) + 1);
  }
};

App.start(APP_CONFIG);
