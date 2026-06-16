import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

let cachedObsidianCookie: string | null = null;
let lastCookieTime = 0;

async function getObsidianCookie(): Promise<string | null> {
  const now = Date.now();
  // Renovar automáticamente cada 24 horas (86400000 ms) para asegurar que la sesión nunca muera
  if (cachedObsidianCookie && (now - lastCookieTime < 86400000)) {
    return cachedObsidianCookie;
  }

  const pwUrl = "https://publish-01.obsidian.md/pw";
  const id = process.env.OBSIDIAN_PUBLISH_ID;
  const pw = process.env.OBSIDIAN_PASSWORD;

  // Fallback a la cookie estática si el usuario prefirió configurarlo de forma manual
  if (!id || !pw) {
    return process.env.OBSIDIAN_AUTH_COOKIE || null;
  }

  try {
    const res = await fetch(pwUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, pw }),
    });

    // Obtener la cabecera Set-Cookie
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      // Extraemos solo el "nombre=valor" ignorando flags como HttpOnly o Path=/
      const cookieMatch = setCookie.match(/^([^;]+)/);
      if (cookieMatch) {
        cachedObsidianCookie = cookieMatch[1];
        lastCookieTime = now;
        console.log("✅ Cookie de Obsidian renovada exitosamente de forma automática.");
        return cachedObsidianCookie;
      }
    } else {
      console.warn("⚠️ No se recibió Set-Cookie de Obsidian. Revisa las credenciales.");
    }
  } catch (error) {
    console.error("Failed to auto-renew Obsidian cookie:", error);
  }
  
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path?: string[] } }) {
  return handleProxy(req, params.path);
}

async function handleProxy(req: NextRequest, pathArray?: string[]) {
  const session = await auth();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const path = pathArray ? pathArray.join("/") : "";
  const queryString = req.nextUrl.search;
  
  const OBSIDIAN_URL = process.env.OBSIDIAN_URL || "https://publish.obsidian.md/tu-sitio";
  const targetUrl = `${OBSIDIAN_URL}/${path}${queryString}`;

  const headers = new Headers();
  
  // Obtener la cookie (del caché o renovándola automáticamente)
  const obsidianCookie = await getObsidianCookie();
  if (obsidianCookie) {
    headers.set("Cookie", obsidianCookie);
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: "manual", 
    });

    const resHeaders = new Headers(response.headers);
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: resHeaders,
    });
  } catch (error) {
    console.error("Proxy Error:", error);
    return new NextResponse("Proxy Error", { status: 500 });
  }
}
