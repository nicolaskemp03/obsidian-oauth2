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

    const location = response.headers.get("location") || "";
    const isRedirectToPw = response.status === 302 && location.endsWith("/pw");

    let isHtmlPasswordForm = false;
    const contentType = response.headers.get("content-type") || "";
    let htmlText = "";
    
    if (contentType.includes("text/html")) {
      const clonedResponse = response.clone();
      htmlText = await clonedResponse.text();
      if (htmlText.includes('type="password"') || htmlText.includes('publish-password')) {
        isHtmlPasswordForm = true;
      }
    }

    if (isRedirectToPw || isHtmlPasswordForm) {
      console.warn("⚠️ Obsidian solicita contraseña. Forzando re-login interno...");
      lastCookieTime = 0; 
      obsidianCookie = await getObsidianCookie(req);
      
      if (obsidianCookie) {
        headers.set("Cookie", obsidianCookie);
        response = await fetch(targetUrl, {
          method: req.method,
          headers: headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
          redirect: "manual", 
        });
        
        if (contentType.includes("text/html")) {
          htmlText = await response.clone().text();
        }
      }
    }

    const resHeaders = new Headers(response.headers);
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
    
    // Si es HTML, inyectamos el script para desbloquear la SPA localmente en el navegador
    if (contentType.includes("text/html") && cachedHpw && process.env.OBSIDIAN_PUBLISH_ID) {
      const siteId = process.env.OBSIDIAN_PUBLISH_ID;
      const script = `<script>
        try {
          // Obsidian Publish usa localStorage para saber si está autenticado y no mostrar el form
          localStorage.setItem("${siteId}", "${cachedHpw}");
          localStorage.setItem("publish-${siteId}", "${cachedHpw}");
          document.cookie = "${siteId}=s%3A${cachedHpw}; Path=/; SameSite=Lax; max-age=86400";
        } catch(e) { console.error("Konexa Proxy Inject Error:", e); }
      </script>`;
      
      htmlText = htmlText.replace('<head>', `<head>${script}`);
      return new NextResponse(htmlText, {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders,
      });
    }

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
