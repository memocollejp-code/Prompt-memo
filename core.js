'use strict';

/* =========================================================
 * PWA Ultimate Template - core.js v1.1.0
 * アプリ共通基盤（このファイルはアプリごとに書き換えない）
 *
 *  IDB      : IndexedDBの薄いPromiseラッパー
 *  Logger   : エラーログ収集（IndexedDB保存・バックアップに同梱）
 *  State    : インメモリ＋非同期IndexedDB永続化
 *             （同期get / デバウンス書き込み / マイグレーション /
 *               読み込み失敗時はデータ保護モードで既存データを守る）
 *  Router   : ハッシュベースSPA（ブラウザ/ハードウェア戻る対応）
 *  Theme    : auto / light / dark（設定はStateに保存＝IndexedDB）
 *  AutoSave : 入力途中データの自動保存・復元（デバウンス付き）
 *  Settings : 設定画面（バックアップ→復元→テーマ→全消去）標準搭載
 *  App      : 起動フロー
 *             （storage.persist / visibilitychange即時コミット /
 *               グローバルエラーフック / 保護モードバナー）
 * ========================================================= */

/* ---------- IDB : IndexedDBミニラッパー ---------- */
const IDB = {
  open(name, version, onUpgrade) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = (e) => {
        try {
          onUpgrade(req.result, e.oldVersion);
        } catch (err) {
          reject(err);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
  },

  /* ストアの全件を { key: value } で取得 */
  getAllEntries(db, storeName) {
    return new Promise((resolve, reject) => {
      let keys, vals;
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      keysReq.onsuccess = () => (keys = keysReq.result);
      valsReq.onsuccess = () => (vals = valsReq.result);
      tx.oncomplete = () => {
        const out = {};
        (keys || []).forEach((k, i) => {
          out[k] = vals[i];
        });
        resolve(out);
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('tx aborted'));
    });
  },

  /* 複数put＋複数deleteを1トランザクションで実行 */
  bulkWrite(db, storeName, puts = {}, deletes = []) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      try {
        Object.entries(puts).forEach(([k, v]) => store.put(v, k));
        deletes.forEach((k) => store.delete(k));
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('tx aborted'));
    });
  },

  add(db, storeName, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).add(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  clearStores(db, storeNames) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, 'readwrite');
      storeNames.forEach((s) => tx.objectStore(s).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

/* ---------- Logger : エラーログ（メモリ＋IndexedDB） ---------- */
const Logger = (() => {
  const MEMORY_MAX = 200;
  const DB_MAX = 300;
  const KEEP_DAYS = 30;
  const memory = [];
  let db = null;

  const write = (entry) => {
    if (!db) return;
    IDB.add(db, 'logs', entry).catch(() => {
      /* ログ保存自体の失敗は握りつぶす（無限ループ防止） */
    });
  };

  const log = (level, message, detail) => {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message: String(message ?? ''),
      detail: detail ? String((detail && detail.stack) || detail) : ''
    };
    memory.push(entry);
    if (memory.length > MEMORY_MAX) memory.shift();
    if (level === 'error') console.error('[Logger]', message, detail ?? '');
    else console.warn('[Logger]', message, detail ?? '');
    write(entry);
  };

  /* DB接続後に呼ぶ。古いログを掃除する */
  const attach = async (database) => {
    db = database;
    if (!db) return;
    try {
      const entries = await IDB.getAllEntries(db, 'logs');
      const keys = Object.keys(entries); // autoIncrement昇順＝時系列
      const limit = Date.now() - KEEP_DAYS * 86400000;
      const drop = [];
      keys.forEach((k, i) => {
        const old = new Date(entries[k].ts).getTime() < limit;
        const over = i < keys.length - DB_MAX;
        if (old || over) drop.push(Number(k));
      });
      if (drop.length) await IDB.bulkWrite(db, 'logs', {}, drop);
    } catch {
      /* 掃除失敗は無視 */
    }
  };

  /* バックアップ同梱用：DB上の全ログ＋メモリ上の未保存分 */
  const dump = async () => {
    if (!db) return [...memory];
    try {
      const entries = await IDB.getAllEntries(db, 'logs');
      return Object.keys(entries).map((k) => entries[k]);
    } catch {
      return [...memory];
    }
  };

  return {
    attach,
    dump,
    error: (m, d) => log('error', m, d),
    warn: (m, d) => log('warn', m, d)
  };
})();

/* ---------- State : インメモリ＋非同期IndexedDB永続化 ---------- */
class State {
  #db = null;
  #data = {};
  #listeners = new Set();
  #dirtyKeys = new Set();
  #deletedKeys = new Set();
  #flushTimer = null;
  #flushWait = 300; // 書き込みデバウンス(ms)
  #healthy = false; // 読み込みに成功したか
  #writable = false; // 永続化してよいか（読込失敗時はfalse＝既存データ保護）
  #initialState;
  #schemaVersion;
  #migrations;

  constructor(initialState = {}, { schemaVersion = 1, migrations = {} } = {}) {
    this.#initialState = structuredClone(initialState);
    this.#schemaVersion = schemaVersion;
    this.#migrations = migrations;
    this.#data = structuredClone(initialState);
  }

  get healthy() {
    return this.#healthy;
  }

  get writable() {
    return this.#writable;
  }

  get schemaVersion() {
    return this.#schemaVersion;
  }

  /*
   * 起動時に1回だけ呼ぶ。IndexedDBから全データをメモリへ一括ロード。
   * 読み込み失敗時は既存データを絶対に上書きしない（保護モード）。
   */
  async init(db) {
    this.#db = db;
    if (!db) {
      Logger.error('State.init: DBが開けないため保護モードで起動します');
      return;
    }
    try {
      const stored = await IDB.getAllEntries(db, 'kv');
      const meta = await IDB.getAllEntries(db, 'meta');
      const hasStored = Object.keys(stored).length > 0;
      let version = Number(meta.schemaVersion) || (hasStored ? 1 : this.#schemaVersion);

      let data = { ...structuredClone(this.#initialState), ...stored };

      /* マイグレーション：旧バージョンのデータを破壊せず順番に変換 */
      const fromVersion = version;
      while (version < this.#schemaVersion) {
        const step = this.#migrations[version + 1];
        if (typeof step === 'function') {
          const migrated = step(structuredClone(data));
          if (migrated && typeof migrated === 'object') data = migrated;
        }
        version++;
      }

      this.#data = data;
      this.#healthy = true;
      this.#writable = true;

      /* マイグレーション実施時・初回起動時はスキーマ番号と全データを保存 */
      if (fromVersion !== this.#schemaVersion || !hasStored) {
        Object.keys(this.#data).forEach((k) => this.#dirtyKeys.add(k));
        await this.flush();
      } else if (Number(meta.schemaVersion) !== this.#schemaVersion) {
        await IDB.bulkWrite(db, 'meta', { schemaVersion: this.#schemaVersion });
      }
    } catch (err) {
      /* 重要：初期データ(SEED)でDBを上書きするリセットは絶対に行わない */
      Logger.error('State読み込み失敗。既存データ保護のため書き込みを停止します', err);
      this.#data = structuredClone(this.#initialState);
      this.#healthy = false;
      this.#writable = false;
    }
  }

  #notify() {
    const snapshot = this.get();
    this.#listeners.forEach((fn) => fn(snapshot));
  }

  #schedulePersist() {
    if (!this.#writable) return;
    clearTimeout(this.#flushTimer);
    this.#flushTimer = setTimeout(() => {
      this.flush();
    }, this.#flushWait);
  }

  /* 未保存分を即時コミット（visibilitychange等から呼ばれる） */
  async flush() {
    clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    if (!this.#db || !this.#writable) return;
    if (this.#dirtyKeys.size === 0 && this.#deletedKeys.size === 0) return;

    const puts = {};
    this.#dirtyKeys.forEach((k) => {
      if (k in this.#data) puts[k] = structuredClone(this.#data[k]);
    });
    const deletes = [...this.#deletedKeys];
    const dirtyBackup = new Set(this.#dirtyKeys);
    const deletedBackup = new Set(this.#deletedKeys);
    this.#dirtyKeys.clear();
    this.#deletedKeys.clear();

    try {
      await IDB.bulkWrite(this.#db, 'kv', puts, deletes);
      await IDB.bulkWrite(this.#db, 'meta', { schemaVersion: this.#schemaVersion });
    } catch (err) {
      /* 失敗した分は差し戻して次回リトライ */
      dirtyBackup.forEach((k) => this.#dirtyKeys.add(k));
      deletedBackup.forEach((k) => this.#deletedKeys.add(k));
      Logger.error('State保存失敗（次回リトライします）', err);
    }
  }

  /* key省略で全体のコピー、指定でその値を返す（メモリから同期で即返す） */
  get(key) {
    return key === undefined ? structuredClone(this.#data) : this.#data[key];
  }

  set(key, value) {
    this.#data[key] = value;
    this.#deletedKeys.delete(key);
    this.#dirtyKeys.add(key);
    this.#schedulePersist();
    this.#notify();
  }

  update(partial) {
    Object.assign(this.#data, partial);
    Object.keys(partial).forEach((k) => {
      this.#deletedKeys.delete(k);
      this.#dirtyKeys.add(k);
    });
    this.#schedulePersist();
    this.#notify();
  }

  remove(key) {
    delete this.#data[key];
    this.#dirtyKeys.delete(key);
    this.#deletedKeys.add(key);
    this.#schedulePersist();
    this.#notify();
  }

  /* 変更を購読。戻り値の関数で解除 */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /*
   * バックアップ用エクスポート（エラーログ同梱）。asyncなのでawaitすること。
   */
  async exportJSON(appInfo = {}) {
    const logs = await Logger.dump();
    return JSON.stringify(
      {
        app: appInfo.appName || '',
        version: appInfo.version || '',
        schemaVersion: this.#schemaVersion,
        exportedAt: new Date().toISOString(),
        data: this.#data,
        logs
      },
      null,
      2
    );
  }

  /*
   * インポート。バリデーションに通るまで既存データには一切触れない。
   * validate: (data) => true | エラーメッセージ文字列
   */
  importJSON(json, validate) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('JSONとして読み込めないファイルです');
    }
    const data = parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('データ形式が不正です');
    }

    let incoming = structuredClone(data);
    let version = Number(parsed.schemaVersion) || 1;
    if (version > this.#schemaVersion) {
      throw new Error('このアプリより新しいバージョンのバックアップです');
    }
    while (version < this.#schemaVersion) {
      const step = this.#migrations[version + 1];
      if (typeof step === 'function') {
        const migrated = step(incoming);
        if (migrated && typeof migrated === 'object') incoming = migrated;
      }
      version++;
    }

    if (typeof validate === 'function') {
      const result = validate(incoming);
      if (result !== true) {
        throw new Error(typeof result === 'string' ? result : 'バックアップの内容が不正です');
      }
    }

    /* ここまで到達して初めて既存データを置き換える */
    const oldKeys = Object.keys(this.#data);
    this.#data = { ...structuredClone(this.#initialState), ...incoming };
    oldKeys.forEach((k) => {
      if (!(k in this.#data)) this.#deletedKeys.add(k);
    });
    Object.keys(this.#data).forEach((k) => this.#dirtyKeys.add(k));
    this.#writable = true;
    this.#schedulePersist();
    this.#notify();
  }

  /* データ全消去（設定画面の2段階確認を経てのみ呼ぶこと） */
  async hardReset() {
    this.#data = structuredClone(this.#initialState);
    this.#dirtyKeys.clear();
    this.#deletedKeys.clear();
    if (this.#db) {
      try {
        await IDB.clearStores(this.#db, ['kv', 'meta']);
        await IDB.bulkWrite(this.#db, 'meta', { schemaVersion: this.#schemaVersion });
        this.#writable = true;
        this.#healthy = true;
      } catch (err) {
        Logger.error('データ全消去に失敗しました', err);
        throw err;
      }
    }
    this.#notify();
  }
}

/* ---------- Router : ハッシュベースSPA ---------- */
class Router {
  #outlet;
  #routes = [];
  #notFound = () => '<p class="empty">ページが見つかりません。</p>';
  #onChange = null;

  constructor(outlet) {
    this.#outlet = outlet;
    window.addEventListener('hashchange', () => this.#resolve());
  }

  /* '/note/:id' のようなパラメータ付きパスに対応 */
  on(path, render) {
    const keys = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return '([^/]+)';
        }) +
        '$'
    );
    this.#routes.push({ path, pattern, keys, render });
    return this;
  }

  has(path) {
    return this.#routes.some((r) => r.path === path);
  }

  notFound(render) {
    this.#notFound = render;
    return this;
  }

  /* 遷移のたびに呼ばれる（戻るボタンの表示制御などに使用） */
  onChange(fn) {
    this.#onChange = fn;
    return this;
  }

  start() {
    this.#resolve();
    return this;
  }

  navigate(path) {
    location.hash = '#' + path;
  }

  replace(path) {
    location.replace(location.pathname + location.search + '#' + path);
  }

  back() {
    if (history.length > 1) {
      history.back();
    } else {
      this.navigate('/');
    }
  }

  get current() {
    return (location.hash.slice(1) || '/').split('?')[0];
  }

  refresh() {
    this.#resolve();
  }

  #resolve() {
    const full = location.hash.slice(1) || '/';
    const [pathPart, queryPart = ''] = full.split('?');
    const query = Object.fromEntries(new URLSearchParams(queryPart));

    let render = this.#notFound;
    let params = {};
    for (const route of this.#routes) {
      const match = pathPart.match(route.pattern);
      if (match) {
        render = route.render;
        params = Object.fromEntries(
          route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])])
        );
        break;
      }
    }

    let result;
    try {
      result = render({ params, query, path: pathPart });
    } catch (err) {
      Logger.error(`画面描画エラー: ${pathPart}`, err);
      result = '<p class="empty">画面の表示中にエラーが発生しました。</p>';
    }
    if (typeof result === 'string') {
      this.#outlet.innerHTML = result;
    } else if (result instanceof Node) {
      this.#outlet.replaceChildren(result);
    }

    window.scrollTo(0, 0);
    if (this.#onChange) this.#onChange(pathPart);
  }
}

/* ---------- Theme : 設定はState（IndexedDB）に保存 ---------- */
const Theme = {
  _state: null,

  init(state) {
    this._state = state;
    this.apply(state.get('_theme') || 'auto', { save: false });
  },

  /* 'auto' | 'light' | 'dark' */
  apply(mode, { save = true } = {}) {
    if (mode === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
    if (save && this._state) this._state.set('_theme', mode);
  },

  get current() {
    return (this._state && this._state.get('_theme')) || 'auto';
  },

  toggle() {
    const isDark =
      this.current === 'dark' ||
      (this.current === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    this.apply(isDark ? 'light' : 'dark');
  }
};

/* ---------- AutoSave : 入力途中データの自動保存・復元 ---------- */
const AutoSave = {
  DRAFT_KEY: '_drafts',
  _state: null,
  _wait: 400,

  init(state) {
    this._state = state;
  },

  /*
   * container配下の name属性付き input/textarea/select を
   * state._drafts[draftId] に自動保存し、bind時に復元する。
   * 例: AutoSave.bind(document.getElementById('app'), 'note-edit');
   */
  bind(container, draftId) {
    if (!this._state || !container) return () => {};
    const fields = container.querySelectorAll('input[name], textarea[name], select[name]');

    /* 復元 */
    const drafts = this._state.get(this.DRAFT_KEY) || {};
    const saved = drafts[draftId];
    if (saved) {
      fields.forEach((el) => {
        if (!(el.name in saved)) return;
        if (el.type === 'checkbox') el.checked = Boolean(saved[el.name]);
        else if (el.type === 'radio') el.checked = el.value === saved[el.name];
        else el.value = saved[el.name];
      });
    }

    /* デバウンス保存 */
    let timer = null;
    const save = () => {
      const value = {};
      fields.forEach((el) => {
        if (el.type === 'checkbox') value[el.name] = el.checked;
        else if (el.type === 'radio') {
          if (el.checked) value[el.name] = el.value;
        } else value[el.name] = el.value;
      });
      const all = this._state.get(this.DRAFT_KEY) || {};
      all[draftId] = value;
      this._state.set(this.DRAFT_KEY, all);
    };
    const onInput = () => {
      clearTimeout(timer);
      timer = setTimeout(save, this._wait);
    };
    container.addEventListener('input', onInput);
    container.addEventListener('change', onInput);

    /* 解除関数を返す */
    return () => {
      clearTimeout(timer);
      container.removeEventListener('input', onInput);
      container.removeEventListener('change', onInput);
    };
  },

  get(draftId) {
    const drafts = (this._state && this._state.get(this.DRAFT_KEY)) || {};
    return drafts[draftId];
  },

  /* 保存完了後に下書きを消す */
  clear(draftId) {
    if (!this._state) return;
    const drafts = this._state.get(this.DRAFT_KEY) || {};
    if (draftId in drafts) {
      delete drafts[draftId];
      this._state.set(this.DRAFT_KEY, drafts);
    }
  }
};

/* ---------- Settings : 設定画面（標準搭載） ---------- */
const Settings = (() => {
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const render = (ctx) => {
    const theme = Theme.current;
    const persisted = ctx.persisted;
    return `
      <section class="card">
        <h2>設定</h2>
        <p class="sub">${esc(ctx.appName)} ${esc(ctx.version)} / データ保存: IndexedDB${
          persisted === true ? '（永続化 許可済み）' : persisted === false ? '（永続化 未許可）' : ''
        }</p>
      </section>

      <div class="section-title">データ管理</div>
      <div class="list">
        <button type="button" class="list-item" data-action="settings-export">
          <span class="list-item-icon" aria-hidden="true">⬇️</span>
          <span class="list-item-body">
            <span class="list-item-title">バックアップ</span>
            <span class="list-item-sub">全データ＋エラーログをJSONで保存</span>
          </span>
        </button>
        <button type="button" class="list-item" data-action="settings-import">
          <span class="list-item-icon" aria-hidden="true">⬆️</span>
          <span class="list-item-body">
            <span class="list-item-title">復元（インポート）</span>
            <span class="list-item-sub">バックアップファイルを読み込み</span>
          </span>
        </button>
      </div>
      <input type="file" id="settingsImportFile" accept=".json,application/json" hidden>

      <div class="section-title">表示</div>
      <div class="card">
        <div class="form-group">
          <label class="form-label" for="settingsTheme">テーマ</label>
          <select id="settingsTheme" class="form-select" data-action="settings-theme">
            <option value="auto"${theme === 'auto' ? ' selected' : ''}>端末の設定に合わせる</option>
            <option value="light"${theme === 'light' ? ' selected' : ''}>ライト</option>
            <option value="dark"${theme === 'dark' ? ' selected' : ''}>ダーク</option>
          </select>
        </div>
      </div>

      <div class="section-title">危険な操作</div>
      <div class="card">
        <button type="button" class="btn btn-danger btn-block" data-action="settings-wipe">データを全消去する</button>
        <p class="sub" style="margin-top:8px;">すべての記録が削除されます。実行前にバックアップをおすすめします。</p>
      </div>
    `;
  };

  const download = async (ctx) => {
    try {
      const json = await ctx.state.exportJSON({ appName: ctx.appName, version: ctx.version });
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${ctx.dbName}_backup_${date}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      Toast.success('バックアップを書き出しました');
    } catch (err) {
      Logger.error('エクスポート失敗', err);
      Toast.error('エクスポートに失敗しました');
    }
  };

  const importFromFile = (ctx, file) => {
    const reader = new FileReader();
    reader.onerror = () => Toast.error('ファイルを読み込めませんでした');
    reader.onload = async () => {
      const ok = await Modal.confirm('現在のデータをバックアップの内容で上書きします。よろしいですか？', {
        title: '復元',
        okText: '上書きする',
        danger: true
      });
      if (!ok) return;
      try {
        ctx.state.importJSON(String(reader.result), ctx.validateImport);
        await ctx.state.flush();
        Toast.success('復元しました');
        ctx.router.navigate('/');
        ctx.router.refresh();
      } catch (err) {
        Logger.error('インポート失敗', err);
        Toast.error(err.message || 'ファイルの形式が不正です');
      }
    };
    reader.readAsText(file);
  };

  const wipe = async (ctx) => {
    const first = await Modal.confirm('すべてのデータを削除します。よろしいですか？', {
      title: 'データ全消去',
      okText: '削除に進む',
      danger: true
    });
    if (!first) return;
    const second = await Modal.confirm('この操作は取り消せません。本当に削除しますか？', {
      title: '最終確認',
      okText: '完全に削除する',
      cancelText: 'やめる',
      danger: true
    });
    if (!second) return;
    try {
      await ctx.state.hardReset();
      Theme.apply('auto');
      Toast.success('すべてのデータを削除しました');
      ctx.router.navigate('/');
      ctx.router.refresh();
    } catch {
      Toast.error('削除に失敗しました');
    }
  };

  /* 設定画面内のイベント（クリック委譲から呼ばれる） */
  const handleAction = (ctx, action, target) => {
    if (action === 'settings-export') {
      download(ctx);
      return true;
    }
    if (action === 'settings-import') {
      const input = document.getElementById('settingsImportFile');
      if (input) {
        input.onchange = () => {
          if (input.files && input.files[0]) importFromFile(ctx, input.files[0]);
          input.value = '';
        };
        input.click();
      }
      return true;
    }
    if (action === 'settings-wipe') {
      wipe(ctx);
      return true;
    }
    return false;
  };

  return { render, handleAction };
})();

/* ---------- App : 起動フロー ---------- */
const App = (() => {
  const ctx = {
    appName: '',
    version: '',
    dbName: '',
    state: null,
    router: null,
    db: null,
    persisted: null,
    validateImport: null
  };

  const setupGlobalHandlers = () => {
    /* 未捕捉エラーをログへ */
    window.addEventListener('error', (e) => {
      Logger.error(`未捕捉エラー: ${e.message}`, e.error);
    });
    window.addEventListener('unhandledrejection', (e) => {
      Logger.error('未処理のPromise拒否', e.reason);
    });

    /* バックグラウンド移行・スリープの瞬間に未保存分を即時コミット */
    const commit = () => {
      if (ctx.state) ctx.state.flush();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') commit();
    });
    window.addEventListener('pagehide', commit);

    /* 長押しコンテキストメニュー抑止（入力欄・.selectableは許可） */
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable], .selectable')) return;
      e.preventDefault();
    });
  };

  const showProtectBanner = () => {
    const banner = document.createElement('div');
    banner.className = 'protect-banner';
    banner.setAttribute('role', 'alert');
    banner.textContent =
      '⚠️ データの読み込みに失敗したため保護モードで起動しています。変更は保存されません。バックアップから復元するか、再起動をお試しください。';
    document.body.prepend(banner);
  };

  /*
   * 起動。app.js から App.start(APP_CONFIG) を呼ぶ。
   * config: {
   *   appName, version, dbName, schemaVersion, migrations,
   *   initialState, validateImport, routes: { '/': fn, ... },
   *   notFound, bottomNav: [{path,label,icon}] | null,
   *   onReady: (ctx) => {}
   * }
   */
  const start = async (config) => {
    ctx.appName = config.appName || 'PWA App';
    ctx.version = config.version || 'v1.0.0';
    ctx.dbName = config.dbName || 'pwa-app';
    ctx.validateImport = config.validateImport || null;

    /* ヘッダーへタイトル・バージョン反映 */
    const titleEl = document.querySelector('.app-title-text');
    if (titleEl) titleEl.textContent = ctx.appName;
    const versionEl = document.getElementById('appVersion');
    if (versionEl) versionEl.textContent = ctx.version;
    document.title = ctx.appName;

    setupGlobalHandlers();

    /* IndexedDBを開く（kv:データ / meta:スキーマ情報 / logs:エラーログ） */
    try {
      ctx.db = await IDB.open(ctx.dbName, 1, (db) => {
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { autoIncrement: true });
      });
    } catch (err) {
      ctx.db = null;
      Logger.error('IndexedDBを開けませんでした', err);
    }
    await Logger.attach(ctx.db);

    /* ストレージ永続化リクエスト（拒否されてもアプリは継続） */
    try {
      if (navigator.storage && navigator.storage.persist) {
        ctx.persisted = (await navigator.storage.persisted())
          ? true
          : await navigator.storage.persist();
      }
    } catch (err) {
      ctx.persisted = null;
      Logger.warn('storage.persist の実行に失敗しました', err);
    }

    /* State初期化（全データをメモリへ一括ロード） */
    ctx.state = new State(config.initialState || {}, {
      schemaVersion: config.schemaVersion || 1,
      migrations: config.migrations || {}
    });
    await ctx.state.init(ctx.db);

    /* グローバル公開（app.jsのルート定義から使う） */
    window.state = ctx.state;

    Theme.init(ctx.state);
    AutoSave.init(ctx.state);

    /* Router構築 */
    const outlet = document.getElementById('app');
    ctx.router = new Router(outlet);
    window.router = ctx.router;

    const routes = config.routes || {};
    Object.entries(routes).forEach(([path, render]) => ctx.router.on(path, render));
    if (!ctx.router.has('/settings')) {
      ctx.router.on('/settings', () => Settings.render(ctx));
    }
    if (config.notFound) ctx.router.notFound(config.notFound);

    /* 戻るボタン */
    const backBtn = document.getElementById('backBtn');
    ctx.router.onChange((path) => {
      if (backBtn) backBtn.hidden = path === '/';
      if (typeof config.onRouteChange === 'function') config.onRouteChange(path);
    });
    if (backBtn) backBtn.addEventListener('click', () => ctx.router.back());

    /* data-nav / data-action のイベント委譲 */
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        ctx.router.navigate(nav.dataset.nav);
        return;
      }
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === 'toggle-theme') {
        Theme.toggle();
        return;
      }
      if (Settings.handleAction(ctx, action, actionEl)) return;
      if (typeof config.onAction === 'function') config.onAction(action, actionEl, e);
    });

    /* 設定画面のテーマselect（changeイベント） */
    document.addEventListener('change', (e) => {
      if (e.target && e.target.dataset && e.target.dataset.action === 'settings-theme') {
        Theme.apply(e.target.value);
      }
    });

    if (!ctx.state.healthy) showProtectBanner();

    if (Array.isArray(config.bottomNav) && config.bottomNav.length) {
      BottomNav.init(config.bottomNav);
    }

    ctx.router.start();
    if (typeof config.onReady === 'function') config.onReady(ctx);
    return ctx;
  };

  return {
    start,
    get ctx() {
      return ctx;
    }
  };
})();
