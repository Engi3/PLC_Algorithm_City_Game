import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import QRCode from "qrcode";

export type CertificateData = {
  studentName: string;
  axisLabel: string;
  score: number;
  dateLabel: string;
  verifyUrl: string;
};

const WIDTH_PX = 1200;
const HEIGHT_PX = 850;

/**
 * Builds the certificate as plain inline-styled HTML (no Tailwind classes).
 * html2canvas cannot parse modern CSS color functions like oklch()/color-mix()
 * that Tailwind v4's generated stylesheet uses, so this template intentionally
 * stays outside that stylesheet entirely - plain hex colors only.
 */
function buildCertificateHtml(data: CertificateData, qrDataUrl: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width: ${WIDTH_PX}px;
    height: ${HEIGHT_PX}px;
    background: #ffffff;
    box-sizing: border-box;
    padding: 48px;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #1e293b;
    position: relative;
  `;

  el.innerHTML = `
    <div style="width:100%; height:100%; box-sizing:border-box; border: 6px solid #1d4ed8; border-radius: 12px; padding: 40px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; position:relative;">
      <div style="position:absolute; top:24px; left:32px; font-size:14px; font-weight:600; color:#64748b; letter-spacing:1px;">PLC ALGORITHM CITY</div>
      <div style="font-size:16px; color:#2563eb; font-weight:600; letter-spacing:2px; margin-bottom:8px;">CERTIFICATE OF COMPETENCY</div>
      <div style="font-size:34px; font-weight:700; color:#1e293b; margin-bottom:28px;">ใบประกาศนียบัตรความสามารถ</div>

      <div style="font-size:16px; color:#64748b; margin-bottom:6px;">ขอมอบให้เพื่อแสดงว่า</div>
      <div style="font-size:40px; font-weight:700; color:#1d4ed8; margin-bottom:24px;">${escapeHtml(data.studentName)}</div>

      <div style="font-size:16px; color:#64748b; margin-bottom:6px;">มีความสามารถผ่านเกณฑ์ในด้าน</div>
      <div style="font-size:28px; font-weight:700; color:#1e293b; margin-bottom:8px;">${escapeHtml(data.axisLabel)}</div>
      <div style="font-size:20px; font-weight:600; color:#16a34a; margin-bottom:32px;">คะแนน ${data.score}/100</div>

      <div style="font-size:14px; color:#94a3b8;">ออกให้เมื่อวันที่ ${escapeHtml(data.dateLabel)}</div>

      <div style="position:absolute; bottom:32px; right:40px; display:flex; flex-direction:column; align-items:center;">
        <img src="${qrDataUrl}" width="90" height="90" style="display:block;" />
        <div style="font-size:11px; color:#94a3b8; margin-top:4px;">สแกนเพื่อตรวจสอบ</div>
      </div>
    </div>
  `;

  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Renders, rasterizes, and downloads the certificate as a landscape A4 PDF. Client-side only. */
export async function generateCertificatePdf(data: CertificateData): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, { width: 200, margin: 1 });

  const container = buildCertificateHtml(data, qrDataUrl);
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  document.body.appendChild(container);

  try {
    // Let the QR <img> actually paint before capture.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [WIDTH_PX, HEIGHT_PX] });
    pdf.addImage(imgData, "PNG", 0, 0, WIDTH_PX, HEIGHT_PX);
    pdf.save(`certificate-${data.axisLabel}-${data.studentName}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
