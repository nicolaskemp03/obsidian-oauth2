import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

let cachedObsidianCookie: string | null = null;
let lastCookieTime = 0;

async function getObsidianCookie(): Promise<string | null> {
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

  try {
    const res = await fetch(pwUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, pw }),
    });

    // Usar getSetCookie() en lugar de get() para soportar múltiples cookies (ej: Cloudflare + Obsidian)
    const setCookies = res.headers.getSetCookie();
    if (setCookies && setCookies.length > 0) {
      const cookieString = setCookies.map(c => c.split(';')[0]).join('; ');
      cachedObsidianCookie = cookieString;
      lastCookieTime = now;
      console.log("✅ Cookie de Obsidian renovada exitosamente de forma automática.");
      return cachedObsidianCookie;
    } else {
      console.warn("⚠️ No se recibió Set-Cookie de Obsidian. HTTP:", res.status);
    }
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
  const targetUrl = `${OBSIDIAN_URL}/${path}${queryString}`;

  const headers = new Headers();
  
  // 1er intento: Obtener la cookie en caché (o renovar si pasaron 24hrs)
  let obsidianCookie = await getObsidianCookie();
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
      obsidianCookie = await getObsidianCookie();
      
      if (obsidianCookie) {
        headers.set("Cookie", obsidianCookie);

        // Si el usuario ya estaba atascado en /pw en su navegador, el targetUrl apuntará a /pw.
        // Al re-intentar, no queremos pedirle la contraseña, queremos llevarlo al inicio.
        const retryTarget = targetUrl.endsWith("/pw") ? OBSIDIAN_URL : targetUrl;

        // Reintentar la petición con la cookie fresca
        response = await fetch(retryTarget, {
          method: req.method,
          headers: headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
          redirect: "manual", 
        });

        // Si el usuario navegó a /pw (porque antes se le filtró un 302), lo redirigimos a la raíz (/)
        if (path === "pw") {
          return NextResponse.redirect(new URL("/", req.url));
        }
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
