import type { MonkeyUserScript } from "vite-plugin-monkey";

export function manifest(): MonkeyUserScript {
  return {
    name: "京东自动评价助手",
    version: "0.1.0",
    description:
      "新版京东评价中心（comment.m.jd.com）全自动评价：滚动加载分页、仅在当前标签页跳转、随机间隔、自动填入真人风格文字 + 全五星并提交；只处理低于阈值的京豆商品。",
    author: "liudaohui404",
    match: ["https://comment.m.jd.com/pc-static/*"],
    grant: ["GM_setValue", "GM_getValue", "GM_addStyle"],
    "run-at": "document-idle",
  };
}
