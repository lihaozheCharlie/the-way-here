export const navigation = [
  { to: "/", label: "此刻", icon: "now", active: ["/"], children: [] },
  { to: "/questions", label: "值得聊聊", icon: "spark", active: ["/questions", "/focus/"], children: [] },
  { to: "/sources", label: "生活记录", icon: "source", active: ["/sources", "/imports/"], children: [] },
  { to: "/knowledge", label: "已有理解", icon: "library", active: ["/knowledge", "/insights", "/cards/", "/mental-models", "/timeline", "/letters", "/relationships", "/page/"], children: [
    { to: "/knowledge", label: "总览", active: ["/knowledge"] },
    { to: "/insights", label: "理解自己", active: ["/insights", "/cards/personal-lines", "/cards/cycles", "/cards/systems", "/mental-models"] },
    { to: "/timeline", label: "人生轨迹", active: ["/timeline"] },
    { to: "/letters", label: "近况回信", active: ["/letters"] },
    { to: "/relationships", label: "人与世界", active: ["/relationships"] },
  ] },
] as const;
