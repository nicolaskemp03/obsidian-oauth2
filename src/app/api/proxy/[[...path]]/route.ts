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

    // Validar si la respuesta es la pantalla de contraseña (cookie expirada u obsoleta)
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const clonedResponse = response.clone();
      const htmlText = await clonedResponse.text();
      // Si Obsidian devuelve un formulario de contraseña, la sesión caducó
      if (htmlText.includes('type="password"') || htmlText.includes('publish-password')) {
        console.warn("⚠️ Se detectó la pantalla de contraseña. La cookie expiró. Forzando re-login...");
        lastCookieTime = 0; // Invalidar caché
        obsidianCookie = await getObsidianCookie();
        
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
