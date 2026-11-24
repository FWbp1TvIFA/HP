/* Barcode (Code 128) and QR code drawing for Wallet cards. Returns SVG strings. */
(function () {
  "use strict";
  const P = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
  // Encode with Code 128 set B (all printable ASCII), or set C for even-length digit strings (denser).
  function code128(text) {
    text = String(text || "").replace(/[^\x20-\x7E]/g, "");
    if (!text) return null;
    let vals;
    if (/^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4) {
      vals = [105]; for (let i = 0; i < text.length; i += 2) vals.push(+text.slice(i, i + 2));
    } else {
      vals = [104]; for (const ch of text) vals.push(ch.charCodeAt(0) - 32);
    }
    let sum = vals[0]; for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
    vals.push(sum % 103); vals.push(106);
    return vals.map(v => P[v]).join("");
  }
  function barcodeSVG(text) {
    const pat = code128(String(text).replace(/\s+/g, ""));
    if (!pat) return "";
    let x = 10, bars = "";
    for (let i = 0; i < pat.length; i++) { const w = +pat[i]; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="60"/>`; x += w; }
    x += 10;
    return `<svg viewBox="0 0 ${x} 60" preserveAspectRatio="none" style="width:100%;height:80px;display:block" shape-rendering="crispEdges" role="img" aria-label="Barcode"><rect width="${x}" height="60" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
  }
  function qrSVG(text) {
    if (!window.qrcodegen || !text) return "";
    const q = window.qrcodegen(0, "M"); q.addData(String(text)); q.make();
    const n = q.getModuleCount(); let r = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) r += `M${x + 2},${y + 2}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + 4} ${n + 4}" style="width:190px;height:190px;display:block;margin:0 auto" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${r}" fill="#000"/></svg>`;
  }
  window.Codes = { code128, barcodeSVG, qrSVG };
})();
