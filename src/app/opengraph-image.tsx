import { ImageResponse } from "next/og";

import { siteConfig } from "@/lib/site";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, rgba(25,40,71,1) 0%, rgba(78,88,110,1) 60%, rgba(229,219,204,1) 100%)",
          color: "white",
          padding: "56px"
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.8
          }}
        >
          Premium EdTech Platform
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "860px" }}>
          <div style={{ fontSize: 86, fontWeight: 700, lineHeight: 1.02 }}>{siteConfig.name}</div>
          <div style={{ fontSize: 34, lineHeight: 1.35, color: "rgba(255,255,255,0.82)" }}>
            Structured video learning across AI, mathematics, English, and exam preparation.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "18px",
            fontSize: 28,
            color: "rgba(255,255,255,0.82)"
          }}
        >
          <div>AI</div>
          <div>Mathematics</div>
          <div>English</div>
          <div>Exam Preparation</div>
        </div>
      </div>
    ),
    size
  );
}
