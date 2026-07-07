'use strict';

/* =========================================================
 * PWA Extensions - utils.js v1.0.0
 * DateUtil   : 日付フォーマット・相対表記・日付演算
 * Validator  : 入力バリデーション（純粋関数）
 * SearchUtil : 日本語対応のインクリメンタル検索・debounce
 * 依存なし。全て副作用のない純粋関数として実装。
 * ========================================================= */

/* ---------- DateUtil ---------- */
const DateUtil = {
  WEEKDAYS_JA: ['日', '月', '火', '水', '木', '金', '土'],

  toDate(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  },

  /* 対応トークン: YYYY MM M DD D HH mm ss ddd(和曜日) */
  format(value, pattern = 'YYYY-MM-DD') {
    const d = this.toDate(value);
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const map = {
      YYYY: String(d.getFullYear()),
      ddd: this.WEEKDAYS_JA[d.getDay()],
      MM: pad(d.getMonth() + 1),
      DD: pad(d.getDate()),
      HH: pad(d.getHours()),
      mm: pad(d.getMinutes()),
      ss: pad(d.getSeconds()),
      M: String(d.getMonth() + 1),
      D: String(d.getDate())
    };
    return pattern.replace(/YYYY|ddd|MM|DD|HH|mm|ss|M|D/g, (token) => map[token]);
  },

  /* 'YYYY-MM-DD'（ローカル時刻基準） */
  toISODate(value = new Date()) {
    return this.format(value, 'YYYY-MM-DD');
  },

  /* '3分前' '2時間後' などの相対表記 */
  fromNow(value) {
    const d = this.toDate(value);
    if (!d) return '';
    const diff = Date.now() - d.getTime();
    const abs = Math.abs(diff);
    const suffix = diff >= 0 ? '前' : '後';
    const MIN = 60000;
    const HOUR = 3600000;
    const DAY = 86400000;
    if (abs < MIN) return diff >= 0 ? 'たった今' : 'まもなく';
    if (abs < HOUR) return `${Math.floor(abs / MIN)}分${suffix}`;
    if (abs < DAY) return `${Math.floor(abs / HOUR)}時間${suffix}`;
    if (abs < DAY * 30) return `${Math.floor(abs / DAY)}日${suffix}`;
    if (abs < DAY * 365) return `${Math.floor(abs / (DAY * 30))}ヶ月${suffix}`;
    return `${Math.floor(abs / (DAY * 365))}年${suffix}`;
  },

  isSameDay(a, b) {
    const d1 = this.toDate(a);
    const d2 = this.toDate(b);
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  },

  isToday(value) {
    return this.isSameDay(value, new Date());
  },

  addDays(value, days) {
    const d = this.toDate(value);
    if (!d) return null;
    d.setDate(d.getDate() + days);
    return d;
  }
};

/* ---------- Validator ---------- */
const Validator = {
  isNotEmpty(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  },

  isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? ''));
  },

  isURL(value) {
    try {
      const url = new URL(String(value));
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  },

  isNumber(value) {
    if (value === '' || value === null || value === undefined) return false;
    if (Array.isArray(value)) return false;
    return Number.isFinite(Number(value));
  },

  isInteger(value) {
    return this.isNumber(value) && Number.isInteger(Number(value));
  },

  isInRange(value, min, max) {
    if (!this.isNumber(value)) return false;
    const n = Number(value);
    return n >= min && n <= max;
  },

  /* 文字数（サロゲートペア対応） */
  hasLength(value, min = 0, max = Infinity) {
    const len = Array.from(String(value ?? '')).length;
    return len >= min && len <= max;
  },

  isDate(value) {
    return !Number.isNaN(new Date(value).getTime());
  },

  /* rules: [{ check: (v) => boolean, message: 'エラー文' }] */
  validate(value, rules) {
    const errors = rules.filter((rule) => !rule.check(value)).map((rule) => rule.message);
    return { valid: errors.length === 0, errors };
  }
};

/* ---------- SearchUtil ---------- */
const SearchUtil = {
  /* 全角/半角・大文字/小文字・カタカナ/ひらがなを吸収して正規化 */
  normalize(text) {
    return String(text ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  },

  /*
   * インクリメンタル検索（スペース区切りAND検索）
   * items : 文字列またはオブジェクトの配列
   * keys  : 省略=全値を対象 / 配列=対象プロパティ名 / 関数=検索文字列を返すgetter
   */
  filter(items, keyword, keys = null) {
    const terms = this.normalize(keyword).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [...items];

    const toText = (item) => {
      if (typeof keys === 'function') return this.normalize(keys(item));
      if (Array.isArray(keys)) {
        return this.normalize(keys.map((key) => item?.[key] ?? '').join(' '));
      }
      if (item !== null && typeof item === 'object') {
        return this.normalize(Object.values(item).join(' '));
      }
      return this.normalize(item);
    };

    return items.filter((item) => {
      const text = toText(item);
      return terms.every((term) => text.includes(term));
    });
  },

  /* 入力イベントの間引き（インクリメンタル検索の負荷対策） */
  debounce(fn, wait = 300) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }
};
