// Prints a DOM element in an isolated iframe so only the document is printed ("Save as PDF" in the dialog).
// The browser does the English text rendering, which PDF libraries such as jsPDF cannot do reliably.
export async function printElement(el) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("");
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AgroFund</title>${styles}
    <style>@page{size:A4;margin:12mm}html,body{background:#fff!important;margin:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${el.innerHTML}</body></html>`);
  doc.close();
  try { await iframe.contentWindow.document.fonts.ready; } catch { /* older browsers: print anyway */ }
  const cleanup = () => iframe.remove();
  iframe.contentWindow.onafterprint = cleanup;
  setTimeout(cleanup, 120000);
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
}
