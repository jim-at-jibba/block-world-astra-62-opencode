const paths: Record<string, string> = {
  plus: "M9 3h4v6h6v4h-6v6H9v-6H3V9h6z",
  play: "M5 3h3v2h3v2h3v2h3v2h3v2h-3v2h-3v2h-3v2H8v2H5z",
  folder: "M2 5h8l2 3h9v3H5v7h15l1-5h2l-2 8H2z",
  controls:
    "M1 6h22v14H1zm3 3v2h2V9zm4 0v2h2V9zm4 0v2h2V9zm4 0v2h3V9zM5 14v2h2v-2zm4 0v2h9v-2z",
  settings:
    "M9 2h6v3l3 1 2-1 3 5-3 2v2l2 2-3 5-3-2-2 1v3H9v-3l-3-1-2 1-3-5 3-2v-2L1 9l3-5 3 2 2-1zm0 7v6h6V9z",
  arrow: "M12 4h3v3h3v3h3v3h-3v3h-3v3h-3v-3h3v-3H3v-3h12V7h-3z",
  chevron: "M8 4h3v3h3v3h3v4h-3v3h-3v3H8v-4h3v-3h3v-2h-3V8H8z",
  bulb: "M8 2h8v2h3v3h2v6h-3v3h-3v2H9v-2H6v-3H3V7h2V4h3zm1 18h6v2H9z",
  globe:
    "M7 1h10v2h4v4h2v10h-2v4h-4v2H7v-2H3v-4H1V7h2V3h4zm1 3v3H5v7h3v3h3v3h3v-5h3v-4h-5V8H9V5h6V4z",
  heart:
    "M2 4h6v2h2v2h3V6h2V4h6v2h2v7h-2v2h-2v2h-2v2h-2v2h-2v2h-3v-2H8v-2H6v-2H4v-2H2v-2H0V6h2z",
  apple: "M12 2h3v4h4v2h3v9h-2v3h-4v2h-3v-2h-2v2H7v-2H4v-3H2V9h2V6h6V4H7V1h5z",
  flag: "M4 2h2v2h2V3h12v10H8v2H6v7H3V2z",
};
export function icon(name: string, size = 22): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges"><path fill-rule="evenodd" d="${paths[name] ?? paths.globe}"/></svg>`;
}
export function cube(size = 29): string {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="#b8d67e" d="m16 1 15 7-15 8L1 8z"/><path fill="#80a95e" d="m1 10 14 7v14L1 24z"/><path fill="#50774c" d="m17 17 14-7v14l-14 7z"/><path fill="#d6e7a6" d="m7 7 8-4 4 2-8 4z"/><path fill="#aac87c" d="m3 13 3 1v5l-3-1z"/></svg>`;
}
