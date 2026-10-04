// ─────────────────────────────────────────────
// 环境与类型声明 (Type Declarations)
// ─────────────────────────────────────────────
declare function GM_setValue(name: string, value: any): void;
declare function GM_getValue<T>(name: string, defaultValue?: T): T;
declare function GM_addStyle(css: string): void;

type LogType = "info" | "success" | "warn" | "error";

// ─────────────────────────────────────────────
// 常量配置 (Constants)
// ─────────────────────────────────────────────
class Config {
  /** 新版评价中心基址 */
  static readonly ORIGIN = "https://comment.m.jd.com";
  static readonly CENTER_URL = "https://comment.m.jd.com/pc-static/center";

  /** 只自动处理“京豆奖励 <= 该值”的商品，高于此值留手动处理 */
  static readonly MAX_AUTO_REWARD = 99;

  /** 星级（1-5），页面上每个评分项都会设置 */
  static readonly STAR = 5;

  /** 随机等待（毫秒） */
  static readonly DELAY_MIN = 2500;
  static readonly DELAY_MAX = 6000;
  static readonly SUBMIT_DELAY_MIN = 1500;
  static readonly SUBMIT_DELAY_MAX = 4000;
  static readonly SCROLL_WAIT_MIN = 600;
  static readonly SCROLL_WAIT_MAX = 1100;

  /** 真人风格模板池：随机选用，避免所有评价千篇一律 */
  static readonly REVIEW_TEXTS = [
    "这款{productName}体验非常棒。物流配送迅速，包装完好无损，配送员服务态度也很好。整体性价比极高，强烈推荐给有需要的朋友，下次还会继续回购！",
    "收到{productName}了，包装很严实，物流速度也快，卖家服务态度好，用下来感觉不错，值得回购！",
    "{productName}质量超出预期，做工精细，和描述完全一致。快递小哥态度也好，很满意的一次购物体验！",
    "这款{productName}性价比很高，发货快包装好，使用效果符合预期，客服回复也及时，全五星！",
    "买之前还犹豫，收到{productName}后发现真不错，物流给力包装完好，卖家服务贴心，强烈推荐！",
    "{productName}物流快，配送员服务好，商品质量也没得说，跟描述的一样，五星好评支持一下！",
    "第三次回购{productName}了，一如既往的好，发货迅速包装严实，京东物流就是快，非常满意！",
    "趁着活动买的{productName}，价格实惠质量过关，包装无破损，物流很快，卖家态度好，好评！",
  ];

  static readonly DEFAULT_TEMPLATE = Config.REVIEW_TEXTS[0];
}

// ─────────────────────────────────────────────
// 工具类 (Utilities)
// ─────────────────────────────────────────────
class Utils {
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  /** 解析卡片上的京豆数，取最大值 */
  static parseReward(text: string | null | undefined): number {
    const nums = [...String(text || "").matchAll(/(\d+)\s*京豆/g)].map((m) =>
      parseInt(m[1], 10),
    );
    return nums.length ? Math.max(...nums) : 0;
  }

  /** React 受控输入框：原生 setter 赋值 + 触发事件 */
  static setNativeValue(
    el: HTMLTextAreaElement | HTMLInputElement,
    value: string,
  ): void {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    ["input", "change"].forEach((evt) =>
      el.dispatchEvent(new Event(evt, { bubbles: true })),
    );
  }

  /** 依次派发指针/鼠标事件，兼容监听 mousedown 或 onClick 的组件 */
  static realClick(el: HTMLElement): void {
    (["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const).forEach(
      (type) => {
        const Ctor: typeof MouseEvent = (type as string).startsWith("pointer")
          ? ((window as any).PointerEvent || MouseEvent)
          : MouseEvent;
        el.dispatchEvent(
          new Ctor(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
          }),
        );
      },
    );
  }

  static async waitFor<T>(
    fn: () => T | null | undefined,
    timeout = 10000,
    interval = 200,
  ): Promise<T | null> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const v = fn();
        if (v) return v;
      } catch {
        /* ignore */
      }
      await this.sleep(interval);
    }
    return null;
  }

  static cardCount(): number {
    return document.querySelectorAll(".wait-rate-card").length;
  }

  /** 从 React fiber 读取卡片的 orderId / wareId */
  static getCardData(
    el: HTMLElement,
  ): { cardData: any; merge: any[] | null } | null {
    const key = Object.keys(el).find(
      (k) =>
        k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
    );
    let f: any = key ? (el as any)[key] : null;
    while (f) {
      const p = f.memoizedProps;
      if (p?.cardData?.orderId)
        return { cardData: p.cardData, merge: p.mergeComments || null };
      if (p?.comments?.[0]?.orderId)
        return { cardData: p.comments[0], merge: p.comments };
      f = f.return;
    }
    return null;
  }

  /** 复刻页面“去评价”的跳转逻辑，得到发布页 URL */
  static buildPublishUrl(info: { cardData: any; merge: any[] | null }): string {
    const a = info.cardData;
    const base = `${Config.ORIGIN}/pc-static`;
    if (a.rateType === "4" || a.rateType === "5") return ""; // 追评类，跳过
    if (a.commentJumpType === "2" && info.merge && info.merge.length) {
      const ids = info.merge.map((x: any) => x.wareId).join(",");
      return `${base}/publish?orderId=${info.merge[0].orderId}&skuId=${ids}&commentType=5`;
    }
    return `${base}/publish?orderId=${a.orderId}&skuId=${a.wareId}&commentType=1`;
  }

  /** 合并评价分组：组内总奖励写在 .merge-header 里 */
  static groupReward(card: HTMLElement): number {
    const list = card.parentElement;
    if (!list || !(list.className || "").includes("merge-list")) return 0;
    const header = list.parentElement?.querySelector(".merge-header");
    return header ? Utils.parseReward(header.textContent) : 0;
  }

  static fillTemplate(tpl: string, name: string): string {
    return String(tpl || Config.DEFAULT_TEMPLATE).split("{productName}").join(name || "商品");
  }

  static pickTemplate(): string {
    const pool = Config.REVIEW_TEXTS;
    return pool[Math.floor(Math.random() * pool.length)] || Config.DEFAULT_TEMPLATE;
  }
}

// ─────────────────────────────────────────────
// 状态与存储管理 (Storage Management)
// ─────────────────────────────────────────────
class Store {
  static get auto(): boolean {
    return GM_getValue<boolean>("jdar2_auto", false);
  }
  static set auto(v: boolean) {
    GM_setValue("jdar2_auto", v);
  }

  /** 当前正在处理的那一条发布页 URL */
  static get pending(): string {
    return GM_getValue<string>("jdar2_pending", "");
  }
  static set pending(v: string) {
    GM_setValue("jdar2_pending", v);
  }

  /** 已处理的发布页 URL，去重用 */
  static get done(): string[] {
    const s = GM_getValue<string>("jdar2_done", "[]");
    try {
      return typeof s === "string" ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }
  static addDone(url: string): void {
    if (!url) return;
    const set = new Set(this.done);
    set.add(url);
    GM_setValue("jdar2_done", JSON.stringify([...set]));
  }
  static clearDone(): void {
    GM_setValue("jdar2_done", "[]");
  }

  static get template(): string {
    return GM_getValue<string>("jdar2_template", Config.DEFAULT_TEMPLATE);
  }
  static set template(v: string) {
    GM_setValue("jdar2_template", v);
  }

  static get maxReward(): number {
    return GM_getValue<number>("jdar2_max_reward", Config.MAX_AUTO_REWARD);
  }
  static set maxReward(v: number) {
    GM_setValue("jdar2_max_reward", v);
  }

  static get dryRun(): boolean {
    return GM_getValue<boolean>("jdar2_dry_run", false);
  }
  static set dryRun(v: boolean) {
    GM_setValue("jdar2_dry_run", v);
  }

  static get returnAfterSubmit(): boolean {
    return GM_getValue<boolean>("jdar2_return_after_submit", true);
  }
}

// ─────────────────────────────────────────────
// UI 与视图渲染 (UI & View)
// ─────────────────────────────────────────────
class UIManager {
  static log(msg: string, type: LogType = "info"): void {
    const icons: Record<LogType, string> = {
      info: "ℹ️",
      success: "✅",
      warn: "⚠️",
      error: "❌",
    };
    const panel = document.getElementById("jdar-log");
    if (panel) {
      const line = document.createElement("div");
      line.className = `jdar-log-line jdar-${type}`;
      line.textContent = `${icons[type]} ${msg}`;
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
    }
    console.log(`[JD自动评价] ${msg}`);
  }

  static setStatus(text: string): void {
    const el = document.getElementById("jdar-status");
    if (el) el.textContent = text;
  }

  static renderPanel(innerHTML: string): void {
    document.getElementById("jdar-panel")?.remove();

    const panel = document.createElement("div");
    panel.id = "jdar-panel";
    panel.innerHTML = `
      <div id="jdar-header">
        <span>🤖 京东自动评价助手</span>
        <button id="jdar-toggle" title="收起/展开">−</button>
      </div>
      <div id="jdar-body">${innerHTML}</div>
    `;
    document.body.appendChild(panel);

    this.bindToggleEvent();
    this.enableDrag(panel);
  }

  static showCompleteBanner(count: number): void {
    const banner = document.createElement("div");
    banner.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:#fff;border:2px solid #e4393c;border-radius:10px;
      padding:28px 40px;text-align:center;font-size:18px;z-index:99999;
      box-shadow:0 6px 32px rgba(0,0,0,.2);
    `;
    banner.innerHTML = `
      🎉 已处理 <b style="color:#e4393c">${count}</b> 条评价！<br>
      <small style="color:#888;font-size:14px">京豆一般会在 1 天内到账</small><br>
      <div style="margin-top:14px;display:flex;gap:10px;justify-content:center">
        <button onclick="location.href='${Config.CENTER_URL}'"
          style="background:#e4393c;color:#fff;border:none;padding:7px 18px;border-radius:4px;cursor:pointer">
          返回评价中心
        </button>
        <button onclick="this.closest('div[style]')?.remove()"
          style="background:#f5f5f5;color:#333;border:1px solid #ddd;padding:7px 18px;border-radius:4px;cursor:pointer">
          关闭
        </button>
      </div>`;
    document.body.appendChild(banner);
  }

  private static bindToggleEvent(): void {
    document
      .getElementById("jdar-toggle")
      ?.addEventListener("click", function (this: HTMLButtonElement) {
        const body = document.getElementById("jdar-body");
        if (!body) return;
        const collapsed = body.style.display === "none";
        body.style.display = collapsed ? "block" : "none";
        this.textContent = collapsed ? "−" : "+";
      });
  }

  private static enableDrag(panel: HTMLElement): void {
    const header = document.getElementById("jdar-header");
    if (!panel || !header) return;

    let startX = 0,
      startY = 0,
      startLeft = 0,
      startTop = 0;

    header.addEventListener("mousedown", (e: MouseEvent) => {
      if ((e.target as HTMLElement).id === "jdar-toggle") return;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      const onMove = (moveEvent: MouseEvent) => {
        panel.style.left = `${startLeft + (moveEvent.clientX - startX)}px`;
        panel.style.top = `${startTop + (moveEvent.clientY - startY)}px`;
        panel.style.right = "auto";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  static injectStyles(): void {
    GM_addStyle(`
      #jdar-panel { position: fixed; right: 20px; top: 80px; width: 320px; background: #fff; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,.15); z-index: 99998; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      #jdar-header { background: #e4393c; color: #fff; padding: 8px 14px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; font-weight: bold; user-select: none; cursor: move; }
      #jdar-header button { background: transparent; border: 1px solid rgba(255,255,255,.6); color: #fff; width: 22px; height: 22px; border-radius: 4px; cursor: pointer; line-height: 1; font-size: 16px; }
      #jdar-body { padding: 12px 14px; max-height: 70vh; overflow-y: auto; }
      #jdar-body p { margin: 0 0 6px; line-height: 1.6; }
      #jdar-body b { color: #e4393c; }
      #jdar-body label { display: block; margin: 6px 0 2px; color: #555; }
      #jdar-body code { background:#f0f0f0; padding:1px 4px; border-radius:3px; font-size:11px; }
      .jdar-log-line { padding: 1px 0; }
      .jdar-success { color: #4caf50; }
      .jdar-warn    { color: #ff9800; }
      .jdar-error   { color: #f44336; }
    `);
  }
}

// ─────────────────────────────────────────────
// 核心业务逻辑 (Core Application)
// ─────────────────────────────────────────────
let busy = false;

class JDAutoReviewApp {
  /** 评价中心（列表页）逻辑 */
  static initCenterPage(): void {
    const max = Store.maxReward;
    const tmpl = Store.template;

    UIManager.renderPanel(`
      <p>待评价卡片：<b id="jdar-loaded">0</b> 张 · 已处理 <b id="jdar-done">${Store.done.length}</b></p>
      <label>只处理京豆 ≤ <input id="jdar-max" type="number" min="1" max="999" value="${max}" style="width:64px;padding:2px 6px;border:1px solid #ccc;border-radius:4px"> 的商品</label>
      <label>评价模板（支持变量 <code>{productName}</code>）</label>
      <textarea id="jdar-template" rows="4" style="width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;resize:vertical;line-height:1.5">${tmpl}</textarea>
      <label style="display:flex;align-items:center;gap:6px;margin-top:6px">
        <input type="checkbox" id="jdar-dry" ${Store.dryRun ? "checked" : ""}> 演练模式（只填写文字+星级，不提交）
      </label>
      <div style="display:flex;gap:8px;margin:10px 0 8px">
        <button id="jdar-start" style="background:#e4393c;color:#fff;border:none;padding:7px 0;border-radius:4px;cursor:pointer;font-size:14px;flex:1;font-weight:bold">🚀 开始全自动</button>
        <button id="jdar-stop" style="background:#777;color:#fff;border:none;padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px">⏹ 停止</button>
      </div>
      <div style="margin-bottom:6px"><a href="javascript:;" id="jdar-reset" style="color:#999;font-size:12px">清空“已处理”记录</a></div>
      <div id="jdar-status" style="margin-bottom:6px;color:#666"></div>
      <div id="jdar-log" style="max-height:150px;overflow-y:auto;background:#f9f9f9;border:1px solid #eee;border-radius:4px;padding:6px;font-size:12px;line-height:1.8"></div>
    `);

    const updateLoaded = () => {
      const el = document.getElementById("jdar-loaded");
      if (el) el.textContent = String(Utils.cardCount());
    };
    updateLoaded();
    setInterval(updateLoaded, 1000);

    document.getElementById("jdar-start")?.addEventListener("click", () => {
      const maxEl = document.getElementById("jdar-max") as HTMLInputElement | null;
      const tplEl = document.getElementById("jdar-template") as HTMLTextAreaElement | null;
      const dryEl = document.getElementById("jdar-dry") as HTMLInputElement | null;
      const n = parseInt(maxEl?.value || String(Config.MAX_AUTO_REWARD), 10);
      Store.maxReward = Number.isFinite(n) && n > 0 ? n : Config.MAX_AUTO_REWARD;
      Store.template = tplEl?.value.trim() || Config.DEFAULT_TEMPLATE;
      Store.dryRun = !!dryEl?.checked;
      Store.auto = true;
      busy = false;
      UIManager.log("开始全自动，扫描中…");
      void this.runCenterLoop();
    });

    document.getElementById("jdar-stop")?.addEventListener("click", () => {
      Store.auto = false;
      Store.pending = "";
      busy = false;
      UIManager.setStatus("已停止");
      UIManager.log("已停止", "warn");
    });

    document.getElementById("jdar-reset")?.addEventListener("click", () => {
      Store.clearDone();
      UIManager.log("已清空记录", "info");
      const d = document.getElementById("jdar-done");
      if (d) d.textContent = "0";
    });

    if (Store.auto) {
      UIManager.setStatus("自动运行中，继续处理…");
      void this.runCenterLoop();
    }
  }

  /** 评价中心：滚动加载 + 选取下一条 */
  static async runCenterLoop(): Promise<void> {
    if (!Store.auto || busy) return;
    busy = true;

    const loaded = await Utils.waitFor(
      () => document.querySelector(".wait-rate-card"),
      8000,
    );
    if (!loaded) {
      // 列表为空
      Store.auto = false;
      UIManager.setStatus("🎉 暂无待评价订单");
      UIManager.log("没有待评价订单", "success");
      return;
    }

    UIManager.setStatus("🔍 扫描中（滚动加载更多）…");
    const next = await this.findNextWithScroll();
    if (!next) {
      Store.auto = false;
      UIManager.setStatus(`🎉 没有更多可处理的待评价（≤ ${Store.maxReward} 京豆）`);
      UIManager.log("全部完成", "success");
      UIManager.showCompleteBanner(Store.done.length);
      return;
    }

    Store.pending = next.url;
    const d = Utils.rand(Config.DELAY_MIN, Config.DELAY_MAX);
    UIManager.setStatus(`⏳ ${Math.round(d / 1000)}s 后打开下一条…`);
    UIManager.log(`下一条：${next.title || next.url.slice(-30)}`);
    setTimeout(() => {
      window.location.href = next.url;
    }, d);
  }

  /** 自上而下滚动，直到找到第一条可处理卡片；到底仍无则返回 null */
  private static async findNextWithScroll(): Promise<{ url: string; title: string } | null> {
    window.scrollTo(0, 0);
    await Utils.sleep(Utils.rand(200, 500));
    let stalled = 0;

    for (let i = 0; i < 80; i++) {
      const list = this.findEligible();
      if (list.length) return list[0];

      const grew = await this.scrollStep();
      if (grew) {
        stalled = 0;
        continue;
      }

      window.scrollTo(0, document.documentElement.scrollHeight);
      window.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 900 }));
      await Utils.sleep(Utils.rand(Config.SCROLL_WAIT_MIN, Config.SCROLL_WAIT_MAX));
      const after = this.findEligible();
      if (after.length) return after[0];
      stalled += 1;
      if (stalled >= 3) break;
    }
    return null;
  }

  private static async scrollStep(): Promise<boolean> {
    const before = Utils.cardCount();
    window.scrollBy(0, Math.round(window.innerHeight * 0.85));
    window.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 400 }));
    await Utils.sleep(Utils.rand(Config.SCROLL_WAIT_MIN, Config.SCROLL_WAIT_MAX));
    return Utils.cardCount() > before;
  }

  private static findEligible(): { url: string; title: string }[] {
    const done = new Set(Store.done);
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(".wait-rate-card"),
    );
    const out: { url: string; title: string }[] = [];

    for (const card of cards) {
      if (!card.querySelector(".rate-btn")) continue;
      const own = Utils.parseReward(card.innerText);
      const grp = Utils.groupReward(card);
      const reward = grp > 0 ? grp : own; // 组内优先用总奖励
      if (!(reward > 0 && reward <= Store.maxReward)) continue;

      const info = Utils.getCardData(card);
      if (!info) continue;
      const url = Utils.buildPublishUrl(info);
      if (!url || done.has(url)) continue;

      const title =
        card.querySelector<HTMLElement>(".product-title-text")?.textContent?.trim() || "";
      out.push({ url, title });
    }
    return out;
  }

  /** 评价填写页逻辑 */
  static async initPublishPage(): Promise<void> {
    const isAuto = Store.auto && !!Store.pending;

    UIManager.renderPanel(`
      <div style="font-size:12px;color:#888;margin-bottom:6px">
        ${isAuto ? "自动模式" : "手动模式"} · 已处理 <b>${Store.done.length}</b> 条
      </div>
      <p id="jdar-status">⏳ 正在准备…</p>
      <div id="jdar-log" style="max-height:180px;overflow-y:auto;background:#f9f9f9;border:1px solid #eee;border-radius:4px;padding:6px;font-size:12px;line-height:1.8"></div>
      ${
        isAuto
          ? '<button id="jdar-stop" style="margin-top:8px;width:100%;background:#777;color:#fff;border:none;padding:6px 0;border-radius:4px;cursor:pointer;font-size:12px">⏹ 停止自动</button>'
          : '<button id="jdar-manual" style="margin-top:8px;width:100%;background:#e4393c;color:#fff;border:none;padding:7px 0;border-radius:4px;cursor:pointer;font-size:13px">填写并提交这一条</button>'
      }
    `);

    document.getElementById("jdar-stop")?.addEventListener("click", () => {
      Store.auto = false;
      Store.pending = "";
      UIManager.log("已停止自动", "warn");
      UIManager.setStatus("已停止");
    });

    if (isAuto) {
      busy = true;
      void this.runPublish();
    } else {
      document.getElementById("jdar-manual")?.addEventListener("click", () => {
        if (busy) return;
        busy = true;
        void this.runPublish(true);
      });
    }
  }

  private static async runPublish(manual = false): Promise<void> {
    if (Store.dryRun && Store.auto) {
      UIManager.setStatus("演练模式：只填写，不提交");
    }

    const ta = await Utils.waitFor(
      () => document.querySelector<HTMLTextAreaElement>("textarea.rate-comment-content-textarea"),
      12000,
    );
    if (!ta) {
      UIManager.log("超时：找不到评价输入框", "error");
      UIManager.setStatus("❌ 找不到输入框");
      Store.auto = false;
      return;
    }

    const title =
      document.querySelector<HTMLElement>(".rate-comment-goods-title")?.innerText?.trim() ||
      "商品";
    const text = Utils.fillTemplate(Store.template, title);

    UIManager.log("填入评价文字…");
    Utils.setNativeValue(ta, text);
    await Utils.sleep(Utils.rand(400, 900));

    const groups = Array.from(
      document.querySelectorAll<HTMLElement>(".scoreBox-conter-score-star-box"),
    );
    UIManager.log(`设置星级（${groups.length} 项）…`);
    for (const g of groups) {
      const items = g.querySelectorAll<HTMLElement>(".scoreBox-conter-score-star-box-item");
      if (items.length) Utils.realClick(items[items.length - 1]);
      await Utils.sleep(Utils.rand(120, 350));
    }

    if (Store.dryRun) {
      UIManager.log("演练模式：已填写，未提交", "warn");
      UIManager.setStatus("✅ 已填写（演练，未提交）");
      Store.auto = false;
      return;
    }

    await Utils.sleep(Utils.rand(Config.SUBMIT_DELAY_MIN, Config.SUBMIT_DELAY_MAX));

    const submit =
      document.querySelector<HTMLElement>(".rate-publish-submit-button") ||
      document.querySelector<HTMLElement>(".rate-publish-submit");
    if (!submit) {
      UIManager.log("找不到发布按钮", "error");
      UIManager.setStatus("❌ 找不到发布按钮");
      Store.auto = false;
      return;
    }

    const url = Store.pending || location.href;
    UIManager.log("提交中…");
    submit.click();
    await Utils.sleep(2500);

    Store.addDone(url);
    Store.pending = "";
    UIManager.log("已提交 ✓", "success");
    UIManager.setStatus("✅ 已提交");

    if (Store.auto && Store.returnAfterSubmit && !manual) {
      setTimeout(() => {
        window.location.href = Config.CENTER_URL;
      }, 1200);
    } else {
      busy = false;
    }
  }

  /** 应用启动入口 */
  static start(): void {
    UIManager.injectStyles();
    const url = location.href;
    if (url.includes("/pc-static/publish")) {
      void this.initPublishPage();
    } else if (url.includes("/pc-static/center")) {
      this.initCenterPage();
    }
  }
}

// ─────────────────────────────────────────────
// 执行入口 (Execution)
// ─────────────────────────────────────────────
JDAutoReviewApp.start();

// 声明文件是一个模块，避免全局变量污染问题
export {};
