// Baixa um QR (SVG já renderizado na tela) como PNG grande e nítido, sem suavização.
export function baixarQrPng(svg: SVGSVGElement, arquivo: string): void {
  const cells = svg.viewBox.baseVal.width;
  const px = Math.round(1200 / cells);
  const total = cells * px;

  const copia = svg.cloneNode(true) as SVGSVGElement;
  copia.setAttribute("width", String(total));
  copia.setAttribute("height", String(total));
  const xml = new XMLSerializer().serializeToString(copia);

  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = total;
    c.height = total;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, total, total);
    ctx.drawImage(img, 0, 0, total, total);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = arquivo;
    a.click();
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}
