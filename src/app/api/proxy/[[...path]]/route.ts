import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

let cachedObsidianCookie: string | null = null;
let lastCookieTime = 0;

async function getObsidianCookie(req: NextRequest): Promise<string | null> {
  const now = Date.now();
  // Renovar automáticamente cada 24 horas (86400000 ms)
  if (cachedObsidianCookie && (now - lastCookieTime < 86400000)) {
    return cachedObsidianCookie;
  }

  const pwUrl = "https://publish-01.obsidian.md/pw";
  
  const id = process.env.OBSIDIAN_PUBLISH_ID;
  const pw = process.env.OBSIDIAN_PASSWORD;

  // Fallback manual
  if (!id || !pw) {
    return process.env.OBSIDIAN_AUTH_COOKIE || null;
  }

  const forwardHeaders = new Headers();
  forwardHeaders.set("Content-Type", "application/json");
  forwardHeaders.set("Origin", "https://publish.obsidian.md");
  forwardHeaders.set("Referer", "https://publish.obsidian.md/");
  
  const userAgent = req.headers.get("user-agent");
  if (userAgent) forwardHeaders.set("User-Agent", userAgent);

  try {
    const res = await fetch(pwUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify({ id, pw }),
    });

    const setCookies = res.headers.getSetCookie();
    const bodyText = await res.text();
    
    // Cloudflare error
    if (res.status === 403) {
      console.error(`❌ Cloudflare bloqueó la IP (HTTP: ${res.status}). Body: ${bodyText.substring(0, 500)}`);
      return null;
    }

    if (res.status === 200) {
      console.log("✅ Obsidian devolvió 200 OK. Body devuelto:", bodyText);
      console.log("Cookies recibidas de Obsidian:", setCookies);

      // Revisar si el token viene en JSON
      try {
        const jsonBody = JSON.parse(bodyText);
        if (jsonBody.token) {
          // Si el token viene en el body, lo construimos como cookie
          cachedObsidianCookie = `obsidian-publish-token=${jsonBody.token}; path=/`; 
          lastCookieTime = now;
          console.log("✅ Token extraído del JSON:", cachedObsidianCookie);
          return cachedObsidianCookie;
        }
      } catch (e) {
        // No es JSON
      }

      // Si no, intentar usar las cookies que llegaron (incluso si no dicen 'publish' u 'obsidian')
      if (setCookies && setCookies.length > 0) {
        // Temporalmente aceptaremos cualquier cookie si fue un 200 OK
        const cookieString = setCookies.map(c => c.split(';')[0]).join('; ');
        cachedObsidianCookie = cookieString;
        lastCookieTime = now;
        console.log("✅ Cookie extraída de Set-Cookie (HTTP 200):", cachedObsidianCookie);
        return cachedObsidianCookie;
      }
    }

    console.warn(`⚠️ Obsidian falló (HTTP ${res.status}). Body: ${bodyText.substring(0, 500)}`);
  } catch (error) {
    console.error("Failed to auto-renew Obsidian cookie:", error);
  }
  
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const resolvedParams = await params;
  return handleProxy(req, resolvedParams.path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const resolvedParams = await params;
  return handleProxy(req, resolvedParams.path);
}

async function handleProxy(req: NextRequest, pathArray?: string[]) {
  const session = await auth();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const path = pathArray ? pathArray.join("/") : "";
  const queryString = req.nextUrl.search;
  
  const OBSIDIAN_URL = process.env.OBSIDIAN_URL || "https://publish.obsidian.md/tu-sitio";
  // Si Obsidian mandó al navegador al /pw, lo interceptamos transparentemente al root
  const cleanPath = path === "pw" ? "" : path;
  const targetUrl = `${OBSIDIAN_URL}/${cleanPath}${queryString}`;

  const headers = new Headers();
  
  // Reenviar los headers originales del usuario (importante para evitar bloqueos de Cloudflare y SSR issues)
  for (const [key, value] of req.headers.entries()) {
    if (!['host', 'connection', 'cookie', 'content-length', 'referer'].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  
  // 1er intento: Obtener la cookie en caché (o renovar si pasaron 24hrs)
  let obsidianCookie = await getObsidianCookie(req);
  if (obsidianCookie) headers.set("Cookie", obsidianCookie);

  try {
    let response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: "manual", 
    });

    // 1. Detectar si Obsidian devuelve un 302 hacia /pw (Cookie inválida)
    const location = response.headers.get("location") || "";
    const isRedirectToPw = response.status === 302 && location.endsWith("/pw");

    // 2. Detectar si Obsidian devuelve HTML con el formulario de contraseña (Cookie inválida)
    let isHtmlPasswordForm = false;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const clonedResponse = response.clone();
      const htmlText = await clonedResponse.text();
      if (htmlText.includes('type="password"') || htmlText.includes('publish-password')) {
        isHtmlPasswordForm = true;
      }
    }

    if (isRedirectToPw || isHtmlPasswordForm) {
      console.warn("⚠️ Se detectó que Obsidian solicita contraseña. La cookie expiró. Forzando re-login interno...");
      lastCookieTime = 0; // Invalidar caché
      obsidianCookie = await getObsidianCookie(req);
      
      if (obsidianCookie) {
        headers.set("Cookie", obsidianCookie);

        // Reintentar la petición con la cookie fresca
        response = await fetch(targetUrl, {
          method: req.method,
          headers: headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
          redirect: "manual", 
        });
      }
    }

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
