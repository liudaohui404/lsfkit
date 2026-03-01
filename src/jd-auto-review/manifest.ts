import type { MonkeyUserScript } from "vite-plugin-monkey";

export function manifest(): MonkeyUserScript {
  return {
    name: "京东自动评价助手",
    version: "2.0.0",
    description:
      "自动评价京东待评价订单：全5星 + 50字评价，通过替换 ruleid 在同标签页内批量完成",
    author: "Auto Review Bot",
    match: [
      "https://club.jd.com/myJdcomments/myJdcomment.action*",
      "https://club.jd.com/myJdcomments/orderVoucher.action*",
      "https://club.jd.com/myJdcomments/saveCommentSuccess.action*",
    ],
    grant: ["GM_setValue", "GM_getValue", "GM_addStyle"],
    "run-at": "document-idle",
  };
}
