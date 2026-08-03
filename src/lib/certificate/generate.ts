import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";

export type CertificateData = {
  studentName: string;
  studentId: string | null;
  axisLabel: string;
  score: number;
  /** e.g. "#3 / 25 คน" - the leaderboard rank at the moment of generation, optional since not every caller has it. */
  rankLabel?: string;
  dateLabel: string;
  verifyUrl: string;
  /** 1-6, matches /public/certificate/certificate {n}.png. */
  backgroundIndex: number;
};

const WIDTH_PX = 1200;
const HEIGHT_PX = 850;

export function backgroundUrlFor(index: number): string {
  return `/certificate/certificate ${index}.png`;
}

/** Fetches a same-origin image and returns it as a data: URL, so html2canvas captures a fully-decoded image instead of racing a CSS background-image's async load. */
async function loadImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Builds the certificate as plain inline-styled HTML (no Tailwind classes).
 * html2canvas cannot parse modern CSS color functions like oklch()/color-mix()
 * that Tailwind v4's generated stylesheet uses, so this template intentionally
 * stays outside that stylesheet entirely - plain hex colors only.
 */
function buildCertificateHtml(data: CertificateData, backgroundDataUrl: string, qrDataUrl: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width: ${WIDTH_PX}px;
    height: ${HEIGHT_PX}px;
    background-image: url('${backgroundDataUrl}');
    background-size: cover;
    background-position: center;
    box-sizing: border-box;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #1e293b;
    position: relative;
  `;

  el.innerHTML = `
    <div style="width:100%; height:100%; box-sizing:border-box; padding: 90px 120px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; position:relative;">
      <div style="font-size:19px; color:#475569; font-weight:600; letter-spacing:2px; margin-bottom:10px;">PLC ALGORITHM Practice</div>
      <div style="font-size:19px; color:#2563eb; font-weight:600; letter-spacing:2px; margin-bottom:16px;">CERTIFICATE OF COMPETENCY</div>
      <div style="font-size:42px; font-weight:700; color:#1e293b; margin-bottom:34px;">ใบประกาศนียบัตรความสามารถ</div>

      <div style="font-size:19px; color:#64748b; margin-bottom:10px;">ขอมอบให้เพื่อแสดงว่า</div>
      <div style="font-size:46px; font-weight:700; color:#1d4ed8; margin-bottom:8px;">${escapeHtml(data.studentName)}</div>
      ${data.studentId ? `<div style="font-size:17px; color:#94a3b8; margin-bottom:30px;">รหัสนักศึกษา ${escapeHtml(data.studentId)}</div>` : `<div style="margin-bottom:30px;"></div>`}

      <div style="font-size:19px; color:#64748b; margin-bottom:10px;">มีความสามารถผ่านเกณฑ์ในด้าน</div>
      <div style="font-size:32px; font-weight:700; color:#1e293b; margin-bottom:12px;">${escapeHtml(data.axisLabel)}</div>
      <div style="font-size:22px; font-weight:600; color:#16a34a; margin-bottom:10px;">คะแนน ${data.score}/100</div>
      ${data.rankLabel ? `<div style="font-size:17px; font-weight:600; color:#b45309; margin-bottom:32px;">อันดับ ${escapeHtml(data.rankLabel)}</div>` : `<div style="margin-bottom:32px;"></div>`}

      <div style="font-size:16px; color:#94a3b8;">ออกให้เมื่อวันที่ ${escapeHtml(data.dateLabel)}</div>

      <div style="position:absolute; bottom:56px; right:80px; display:flex; flex-direction:column; align-items:center;">
        <img src="${qrDataUrl}" width="84" height="84" style="display:block;" />
        <div style="font-size:12px; color:#94a3b8; margin-top:6px;">สแกนเพื่อตรวจสอบ</div>
      </div>
    </div>
  `;

  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Shared render step: builds the off-screen HTML certificate, rasterizes it, and returns the canvas. Both the PDF and PNG download paths reuse this so the two outputs never visually drift apart. */
async function renderCertificateCanvas(data: CertificateData): Promise<HTMLCanvasElement> {
  const [backgroundDataUrl, qrDataUrl] = await Promise.all([
    loadImageAsDataUrl(backgroundUrlFor(data.backgroundIndex)),
    QRCode.toDataURL(data.verifyUrl, { width: 200, margin: 1 }),
  ]);

  const container = buildCertificateHtml(data, backgroundDataUrl, qrDataUrl);
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  document.body.appendChild(container);

  try {
    // Let the QR <img> actually paint before capture (the background is
    // already a decoded data: URL, so only the QR <img> needs this).
    await new Promise((resolve) => setTimeout(resolve, 50));
    return await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
  } finally {
    document.body.removeChild(container);
  }
}

/** Renders, rasterizes, and downloads the certificate as a landscape A4-ratio PDF. Client-side only. */
export async function generateCertificatePdf(data: CertificateData): Promise<void> {
  const canvas = await renderCertificateCanvas(data);
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [WIDTH_PX, HEIGHT_PX] });
  pdf.addImage(imgData, "PNG", 0, 0, WIDTH_PX, HEIGHT_PX);
  pdf.save(`certificate-${data.axisLabel}-${data.studentName}.pdf`);
}

/** Same render as generateCertificatePdf but downloads a plain PNG image instead. */
export async function generateCertificateImage(data: CertificateData): Promise<void> {
  const canvas = await renderCertificateCanvas(data);
  const link = document.createElement("a");
  link.download = `certificate-${data.axisLabel}-${data.studentName}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
