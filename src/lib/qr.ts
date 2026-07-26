import QRCode from "qrcode";

export function getEquipmentPublicUrl(qrToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/e/${qrToken}`;
}

export async function generateQrDataUrl(url: string) {
  return QRCode.toDataURL(url, { width: 480, margin: 2 });
}

export async function generateQrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", width: 480, margin: 2 });
}
