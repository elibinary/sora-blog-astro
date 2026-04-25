import type { APIRoute } from "astro";
import { SITE } from "@/config";
import { generateOgImageForSite } from "@/utils/generateOgImages";
import fs from "node:fs";
import path from "node:path";

export const GET: APIRoute = async ({ url }) => {
  try {
    const buffer = await generateOgImageForSite();
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png" },
    });
  } catch {
    // Fallback: serve static OG image when Google Fonts is unavailable
    const staticOgPath = path.resolve("public/astropaper-og.jpg");
    const fileBuffer = fs.readFileSync(staticOgPath);
    return new Response(new Uint8Array(fileBuffer), {
      headers: { "Content-Type": "image/jpeg" },
    });
  }
};
