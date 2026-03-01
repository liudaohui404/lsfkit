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
  static readonly BASE_URL =
    "https://club.jd.com/myJdcomments/orderVoucher.action?ruleid=";
  static readonly DEFAULT_TEMPLATE =
    "这款{productName}体验非常棒。" +
    "物流配送迅速，包装完好无损，配送员服务态度也很好。" +
    "整体性价比极高，强烈推荐给有需要的朋友，下次还会继续回购！";
}

// ─────────────────────────────────────────────
// 工具类 (Utilities)
// ─────────────────────────────────────────────
class Utils {
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static getRuleId(url: string = location.href): string {
    return new URLSearchParams(new URL(url).search).get("ruleid") || "";
  }

  static extractRuleId(href: string): string {
    try {
      const fullUrl = href.startsWith("//") ? `https:${href}` : href;
      return new URLSearchParams(new URL(fullUrl).search).get("ruleid") || "";
    } catch {
      return "";
    }
  }
}

// ─────────────────────────────────────────────
// 状态与存储管理 (Storage Management)
// ─────────────────────────────────────────────
class Store {
  static get queue(): string[] {
    const q = GM_getValue("__jdar_queue__", "[]");
    return typeof q === "string" ? JSON.parse(q) : [];
  }

  static set queue(ruleIds: string[]) {
    GM_setValue("__jdar_queue__", JSON.stringify(ruleIds));
  }

  static get index(): number {
    return GM_getValue("__jdar_index__", 0);
  }

  static set index(i: number) {
    GM_setValue("__jdar_index__", i);
  }

  static get total(): number {
    return GM_getValue("__jdar_total__", this.queue.length);
  }

  static set total(val: number) {
    GM_setValue("__jdar_total__", val);
  }

  static get template(): string {
    return GM_getValue("__jdar_template__", Config.DEFAULT_TEMPLATE);
  }

  static set template(val: string) {
    GM_setValue("__jdar_template__", val);
  }

  static clearQueue(): void {
    GM_setValue("__jdar_queue__", "[]");
    GM_setValue("__jdar_index__", 0);
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
      🎉 全部 <b style="color:#e4393c">${count}</b> 个订单评价完成！<br>
      <small style="color:#888;font-size:14px">京豆将于1天内返还到账户</small><br>
      <div style="margin-top:14px;display:flex;gap:10px;justify-content:center">
        <button onclick="window.location.href='https://club.jd.com/myJdcomments/myJdcomment.action?sort=0'"
          style="background:#e4393c;color:#fff;border:none;padding:7px 18px;border-radius:4px;cursor:pointer">
          返回待评价列表
        </button>
        <button onclick="this.closest('div[style]').remove()"
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

    let startX: number, startY: number, startLeft: number, startTop: number;

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
      #jdar-panel { position: fixed; right: 20px; top: 80px; width: 300px; background: #fff; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,.15); z-index: 99998; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      #jdar-header { background: #e4393c; color: #fff; padding: 8px 14px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; font-weight: bold; user-select: none; cursor: move; }
      #jdar-header button { background: transparent; border: 1px solid rgba(255,255,255,.6); color: #fff; width: 22px; height: 22px; border-radius: 4px; cursor: pointer; line-height: 1; font-size: 16px; }
      #jdar-body { padding: 12px 14px; }
      #jdar-body p { margin: 0 0 6px; line-height: 1.6; }
      #jdar-body b { color: #e4393c; }
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
class JDAutoReviewApp {
  /** 待评价列表页逻辑 */
  static initListPage(): void {
    const allRuleIds = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="orderVoucher.action"]',
      ),
    )
      .map((a) => Utils.extractRuleId(a.getAttribute("href") || ""))
      .filter(Boolean);

    const ruleIds = [...new Set(allRuleIds)];

    if (ruleIds.length === 0) {
      UIManager.renderPanel('<p style="color:#888">暂无待评价订单 🎉</p>');
      return;
    }

    const savedCount = GM_getValue<number>("reviewCount", 1);
    const defaultCount =
      savedCount === 0 ? ruleIds.length : Math.min(savedCount, ruleIds.length);
    const savedTemplate = GM_getValue<string>(
      "reviewTemplate",
      Config.DEFAULT_TEMPLATE,
    );

    UIManager.renderPanel(`
      <p>检测到 <b>${ruleIds.length}</b> 个待评价订单</p>
      <div style="margin:8px 0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <label style="white-space:nowrap">评价数量：</label>
          <input id="jdar-count" type="number" min="1" max="${ruleIds.length}" value="${defaultCount}" style="width:56px;padding:2px 6px;border:1px solid #ccc;border-radius:4px">
          <span style="color:#888;font-size:12px">（0 = 全部）</span>
        </div>
        <div style="margin-bottom:6px">
          <label style="display:block;margin-bottom:4px">评价模板：</label>
          <textarea id="jdar-template" rows="4" style="width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;resize:vertical;line-height:1.5">${savedTemplate}</textarea>
          <div style="font-size:11px;color:#999;margin-top:2px">支持变量：<code>{productName}</code></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button id="jdar-start" style="background:#e4393c;color:#fff;border:none;padding:7px 0;border-radius:4px;cursor:pointer;font-size:14px;flex:1;font-weight:bold">🚀 开始自动评价</button>
        <button id="jdar-save-cfg" style="background:#555;color:#fff;border:none;padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px">💾 保存</button>
      </div>
      <div id="jdar-log" style="max-height:140px;overflow-y:auto;background:#f9f9f9;border:1px solid #eee;border-radius:4px;padding:6px;font-size:12px;line-height:1.8"></div>
    `);

    document.getElementById("jdar-save-cfg")?.addEventListener("click", () => {
      const tmpl = (
        document.getElementById("jdar-template") as HTMLTextAreaElement
      ).value.trim();
      const cnt = parseInt(
        (document.getElementById("jdar-count") as HTMLInputElement).value,
        10,
      );
      if (tmpl) GM_setValue("reviewTemplate", tmpl);
      GM_setValue("reviewCount", isNaN(cnt) ? 1 : cnt);
      UIManager.log("设置已保存！", "success");
    });

    document.getElementById("jdar-start")?.addEventListener("click", () => {
      const template =
        (
          document.getElementById("jdar-template") as HTMLTextAreaElement
        ).value.trim() || Config.DEFAULT_TEMPLATE;
      const inputCount = parseInt(
        (document.getElementById("jdar-count") as HTMLInputElement).value,
        10,
      );
      const count =
        !inputCount || inputCount === 0
          ? ruleIds.length
          : Math.min(inputCount, ruleIds.length);
      const queue = ruleIds.slice(0, count);

      Store.queue = queue;
      Store.index = 0;
      Store.template = template;
      Store.total = queue.length;

      UIManager.log(`已提取 ${queue.length} 个 ruleid，正在跳转到第 1 个...`);
      setTimeout(
        () => (window.location.href = Config.BASE_URL + queue[0]),
        800,
      );
    });
  }

  /** 评价填写页逻辑 */
  static async initReviewPage(): Promise<void> {
    const currentRuleId = Utils.getRuleId();
    const { queue, index, total } = Store;
    const inQueue = queue.length > 0 && queue[index] === currentRuleId;

    UIManager.renderPanel(`
      <div style="font-size:12px;color:#888;margin-bottom:6px">
        ${inQueue ? `进度：<b style="color:#e4393c">${index + 1} / ${total}</b>` : "单次评价模式"}
        &nbsp;·&nbsp;ruleid: <code>${currentRuleId}</code>
      </div>
      <p id="jdar-status">⏳ 正在自动填写评价，请稍候...</p>
      <div id="jdar-log" style="max-height:200px;overflow-y:auto;background:#f9f9f9;border:1px solid #eee;border-radius:4px;padding:6px;font-size:12px;line-height:1.8"></div>
      ${
        inQueue
          ? `
        <div style="margin-top:8px;display:flex;gap:6px">
          <button id="jdar-skip" style="flex:1;background:#f5f5f5;color:#333;border:1px solid #ddd;padding:5px 0;border-radius:4px;cursor:pointer;font-size:12px">⏭ 跳过此单</button>
          <button id="jdar-stop" style="flex:1;background:#f5f5f5;color:#333;border:1px solid #ddd;padding:5px 0;border-radius:4px;cursor:pointer;font-size:12px">⏹ 停止批量</button>
        </div>`
          : ""
      }
    `);

    if (inQueue) {
      document.getElementById("jdar-skip")?.addEventListener("click", () => {
        UIManager.log("已手动跳过", "warn");
        this.navigateNext(index, queue);
      });
      document.getElementById("jdar-stop")?.addEventListener("click", () => {
        Store.clearQueue();
        UIManager.log("批量评价已停止", "warn");
        (document.getElementById("jdar-skip") as HTMLButtonElement).disabled =
          true;
        (document.getElementById("jdar-stop") as HTMLButtonElement).disabled =
          true;
      });
    }

    const delayMs = GM_getValue<number>("delayMs", 600);
    await Utils.sleep(delayMs);

    try {
      // 1. 全部打 5 星
      const star5s = document.querySelectorAll<HTMLElement>("span.star5");
      star5s.forEach((el) => el.click());
      UIManager.log(`已点击 ${star5s.length} 个五星评分项`, "success");
      await Utils.sleep(delayMs / 2);

      // 2. 获取商品名
      const productNameEl = document.querySelector<HTMLElement>(
        '.p-name a, .comment-goods-name a, a[href*="item.jd.com"]',
      );
      const productName =
        productNameEl?.textContent
          ?.trim()
          .replace(/\s+/g, "")
          .substring(0, 15) || "该商品";

      // 3. 生成评价文字
      const reviewText = Store.template.replace(
        /\{productName\}/g,
        productName,
      );

      // 4. 找到并填写评价 textarea
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder*="分享体验心得"]',
      );
      if (textarea) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(textarea, reviewText);
          ["input", "change", "keyup"].forEach((evt) =>
            textarea.dispatchEvent(new Event(evt, { bubbles: true })),
          );
          UIManager.log(`已填写 ${textarea.value.length} 字`, "success");
        }
      } else {
        UIManager.log("未找到文字输入框，仅点击评价星星", "warn");
      }

      await Utils.sleep(delayMs);

      // 5. 点击发表
      const publishLink =
        Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
          (a) => a.textContent?.trim() === "发表",
        ) ||
        document.querySelector<HTMLElement>(
          ".btn-submit, #submitBtn, .btn-review-submit",
        );

      if (!publishLink) {
        UIManager.log('未找到"发表"按钮！', "error");
        UIManager.setStatus("❌ 未找到发表按钮，请手动提交");
        return;
      }

      UIManager.log("正在点击发表...");
      publishLink.click();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      UIManager.log(`评价出错：${errorMsg}`, "error");
      UIManager.setStatus("❌ 出现错误，请查看日志");
    }
  }

  /** 提交成功页逻辑 */
  static async initSuccessPage(): Promise<void> {
    const { queue, index, total } = Store;
    if (queue.length === 0) return;

    UIManager.renderPanel(`
      <p>✅ 第 <b>${index + 1}</b> 个评价成功！（共 ${total} 个）</p>
      <div id="jdar-log" style="max-height:100px;overflow-y:auto;background:#f9f9f9;border:1px solid #eee;border-radius:4px;padding:6px;font-size:12px;line-height:1.8"></div>
    `);

    UIManager.log(`ruleid=${queue[index]} 评价完成`, "success");
    await this.navigateNext(index, queue);
  }

  /** 队列跳转逻辑 */
  private static async navigateNext(
    currentIndex: number,
    queue: string[],
  ): Promise<void> {
    const nextIndex = currentIndex + 1;
    Store.index = nextIndex;

    if (nextIndex < queue.length) {
      UIManager.log(`跳转到第 ${nextIndex + 1} 个，ruleid=${queue[nextIndex]}`);
      await Utils.sleep(1000);
      window.location.href = Config.BASE_URL + queue[nextIndex];
    } else {
      UIManager.log(`全部 ${queue.length} 个订单评价完成！`, "success");
      Store.clearQueue();
      UIManager.showCompleteBanner(queue.length);
    }
  }

  /** 应用启动入口 */
  static start(): void {
    UIManager.injectStyles();

    const url = location.href;
    if (url.includes("saveCommentSuccess")) {
      this.initSuccessPage();
    } else if (url.includes("orderVoucher.action")) {
      this.initReviewPage();
    } else if (url.includes("myJdcomment.action")) {
      this.initListPage();
    }
  }
}

// ─────────────────────────────────────────────
// 执行入口 (Execution)
// ─────────────────────────────────────────────
JDAutoReviewApp.start();

// 声明文件是一个模块，避免全局变量污染问题
export {};
